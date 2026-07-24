/* ============================================================
   DAVY PESCA — App de Vendas
   ============================================================ */

/* ------------------------------------------------------------
   1) CONFIGURAÇÃO DO SUPABASE
   Troque os dois valores abaixo pelos do SEU projeto Supabase.
   (Settings > API no painel do Supabase)
   Enquanto estiverem em branco, o app funciona só neste aparelho.
------------------------------------------------------------ */
const SUPABASE_URL = "";      // ex: https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = ""; // ex: eyJhbGciOi...

const USANDO_NUVEM = SUPABASE_URL && SUPABASE_ANON_KEY;
let sb = null;
if (USANDO_NUVEM && window.supabase) {
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/* ------------------------------------------------------------
   2) ESTADO
------------------------------------------------------------ */
let vendedores = [];      // [{id, nome}]
let produtos = [];        // catálogo p/ autocomplete [{nome, ultimo_preco}]
let vendas = [];          // cache local de vendas
let vendedorAtual = null; // nome
let carrinho = [];        // [{nome, qtd, preco}]
let pagamentos = [];      // [{forma, valor}]
let diaAtual = new Date();
let mesAtual = new Date();

const LS = {
  vendedores: 'dp_vendedores',
  produtos: 'dp_produtos',
  vendas: 'dp_vendas',
  vendedorAtual: 'dp_vendedor_atual'
};

/* ------------------------------------------------------------
   3) HELPERS
------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const money = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const moneyShort = (n) => 'R$ ' + Number(n||0).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});
const parseMoney = (s) => { if(typeof s==='number')return s; return parseFloat(String(s||'').replace(/\./g,'').replace(',','.'))||0; };
const hojeISO = (d) => { const x=d||new Date(); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,7);

function toast(msg, erro){
  const t=$('toast'); t.textContent=msg; t.className='toast mostrar'+(erro?' erro':'');
  setTimeout(()=>t.className='toast',2200);
}

/* ------------------------------------------------------------
   4) PERSISTÊNCIA (nuvem ou local)
------------------------------------------------------------ */
function salvarLocal(){
  localStorage.setItem(LS.vendedores, JSON.stringify(vendedores));
  localStorage.setItem(LS.produtos, JSON.stringify(produtos));
  localStorage.setItem(LS.vendas, JSON.stringify(vendas));
}
function carregarLocal(){
  vendedores = JSON.parse(localStorage.getItem(LS.vendedores)||'[]');
  produtos   = JSON.parse(localStorage.getItem(LS.produtos)||'[]');
  vendas     = JSON.parse(localStorage.getItem(LS.vendas)||'[]');
  vendedorAtual = localStorage.getItem(LS.vendedorAtual)||null;
}

async function carregarTudo(){
  if(USANDO_NUVEM){
    const [rv, rp, rvd] = await Promise.all([
      sb.from('vendedores').select('*').order('nome'),
      sb.from('produtos').select('*').order('nome'),
      sb.from('vendas').select('*').order('criado_em',{ascending:false})
    ]);
    vendedores = rv.data||[];
    produtos = rp.data||[];
    vendas = rvd.data||[];
  } else {
    carregarLocal();
  }
}

/* ------------------------------------------------------------
   5) INICIALIZAÇÃO
------------------------------------------------------------ */
async function init(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  carregarLocal();
  vendedorAtual = localStorage.getItem(LS.vendedorAtual)||null;

  await carregarTudo();

  // Se não há vendedores, força cadastro
  if(vendedores.length===0){
    mostrarEntrada(true);
  } else if(vendedorAtual && vendedores.some(v=>v.nome===vendedorAtual)){
    abrirApp();
  } else {
    mostrarEntrada(false);
  }

  // tempo real
  if(USANDO_NUVEM){
    sb.channel('vendas-rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'vendas'},()=>refreshTudo())
      .on('postgres_changes',{event:'*',schema:'public',table:'produtos'},()=>refreshTudo())
      .on('postgres_changes',{event:'*',schema:'public',table:'vendedores'},()=>refreshTudo())
      .subscribe();
  }
}

async function refreshTudo(){
  await carregarTudo();
  renderDiario();
  renderDashboard();
  renderVendedores();
}

/* ------------------------------------------------------------
   6) TELA DE ENTRADA / VENDEDOR
------------------------------------------------------------ */
function mostrarEntrada(irParaConfig){
  $('tela-entrada').style.display='flex';
  $('app').style.display='none';
  const sel=$('sel-vendedor-entrada');
  sel.innerHTML = vendedores.length
    ? vendedores.map(v=>`<option value="${escapeHtml(v.nome)}">${escapeHtml(v.nome)}</option>`).join('')
    : '<option value="">— cadastre um vendedor —</option>';
  if(irParaConfig){
    // abre direto na config pra cadastrar o 1º vendedor
    $('tela-entrada').style.display='none';
    $('app').style.display='block';
    vendedorAtual = '(configurando)';
    $('hdr-vendedor').textContent='—';
    irTab('tela-config');
    renderVendedores();
    checarAvisoSupabase();
  }
}

function entrar(){
  const sel=$('sel-vendedor-entrada');
  if(!sel.value){ toast('Cadastre um vendedor primeiro',true); return; }
  vendedorAtual = sel.value;
  localStorage.setItem(LS.vendedorAtual, vendedorAtual);
  abrirApp();
}

function abrirApp(){
  $('tela-entrada').style.display='none';
  $('app').style.display='block';
  $('hdr-vendedor').textContent = vendedorAtual;
  irTab('tela-vender');
  renderDiario();
  renderDashboard();
  renderVendedores();
  checarAvisoSupabase();
}

function irConfig(){
  $('tela-entrada').style.display='none';
  $('app').style.display='block';
  vendedorAtual = vendedorAtual||'(configurando)';
  $('hdr-vendedor').textContent = vendedores.some(v=>v.nome===vendedorAtual)?vendedorAtual:'—';
  irTab('tela-config');
  renderVendedores();
  checarAvisoSupabase();
}

function trocarVendedor(){
  localStorage.removeItem(LS.vendedorAtual);
  vendedorAtual=null;
  mostrarEntrada(false);
}

function checarAvisoSupabase(){
  $('aviso-supabase').style.display = USANDO_NUVEM ? 'none' : 'block';
}

/* ------------------------------------------------------------
   7) NAVEGAÇÃO
------------------------------------------------------------ */
function irTab(id){
  document.querySelectorAll('.tela').forEach(t=>t.classList.remove('ativa'));
  $(id).classList.add('ativa');
  document.querySelectorAll('nav.tabbar button').forEach(b=>b.classList.toggle('ativa', b.dataset.tab===id));
  if(id==='tela-diario') renderDiario();
  if(id==='tela-dashboard') renderDashboard();
  if(id==='tela-config') renderVendedores();
  window.scrollTo(0,0);
}

/* ------------------------------------------------------------
   8) VENDEDORES (CRUD)
------------------------------------------------------------ */
async function addVendedor(){
  const inp=$('in-novo-vendedor');
  const nome=inp.value.trim();
  if(!nome){ toast('Digite o nome',true); return; }
  if(vendedores.some(v=>v.nome.toLowerCase()===nome.toLowerCase())){ toast('Vendedor já existe',true); return; }

  const novo={id:uid(),nome};
  if(USANDO_NUVEM){
    const {data,error}=await sb.from('vendedores').insert({nome}).select().single();
    if(error){ toast('Erro ao salvar',true); return; }
    novo.id=data.id;
  }
  vendedores.push(novo);
  vendedores.sort((a,b)=>a.nome.localeCompare(b.nome));
  salvarLocal();
  inp.value='';
  renderVendedores();
  // atualiza select de entrada
  const sel=$('sel-vendedor-entrada');
  if(sel) sel.innerHTML=vendedores.map(v=>`<option value="${escapeHtml(v.nome)}">${escapeHtml(v.nome)}</option>`).join('');
  toast('Vendedor cadastrado');
}

function removerVendedor(id){
  const v=vendedores.find(x=>x.id==id);
  if(!v) return;
  abrirModal('Remover vendedor', `Remover "${v.nome}"? As vendas registradas por ele continuam no histórico.`, async()=>{
    if(USANDO_NUVEM) await sb.from('vendedores').delete().eq('id',id);
    vendedores=vendedores.filter(x=>x.id!=id);
    salvarLocal();
    renderVendedores();
    fecharModal();
    toast('Vendedor removido');
  });
}

function renderVendedores(){
  const el=$('lista-vendedores');
  if(!el) return;
  if(vendedores.length===0){ el.innerHTML='<div class="dica" style="margin:10px 0 0">Nenhum vendedor cadastrado ainda.</div>'; return; }
  el.innerHTML=vendedores.map(v=>`
    <div class="vend-item">
      <span class="vi-nome">${escapeHtml(v.nome)}</span>
      <button class="vi-x" onclick="removerVendedor('${v.id}')">✕</button>
    </div>`).join('');
}

/* ------------------------------------------------------------
   9) AUTOCOMPLETE DE PRODUTOS
------------------------------------------------------------ */
function buscarProduto(termo){
  const box=$('sugestoes-produto');
  const t=(termo||'').trim().toLowerCase();
  let lista = produtos.slice();
  if(t) lista=lista.filter(p=>p.nome.toLowerCase().includes(t));
  lista=lista.sort((a,b)=>(b.vezes||0)-(a.vezes||0)).slice(0,6);
  if(lista.length===0){ box.className='sugestoes'; box.innerHTML=''; return; }
  box.innerHTML=lista.map(p=>`
    <div class="sugestao" onclick="escolherProduto('${escapeHtml(p.nome).replace(/'/g,"\\'")}', ${p.ultimo_preco||0})">
      <span class="nome">${escapeHtml(p.nome)}</span>
      ${p.ultimo_preco?`<span class="preco">${money(p.ultimo_preco)}</span>`:''}
    </div>`).join('');
  box.className='sugestoes mostrar';
}

function escolherProduto(nome, preco){
  $('in-produto').value=nome;
  if(preco>0) $('in-preco').value=Number(preco).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  $('sugestoes-produto').className='sugestoes';
  $('in-qtd').focus();
}

document.addEventListener('click',(e)=>{
  if(!e.target.closest('.autocomplete-wrap')){
    const box=$('sugestoes-produto'); if(box) box.className='sugestoes';
  }
});

/* ------------------------------------------------------------
   10) CARRINHO
------------------------------------------------------------ */
function adicionarItem(){
  const nome=$('in-produto').value.trim();
  const qtd=parseInt($('in-qtd').value)||0;
  const preco=parseMoney($('in-preco').value);
  if(!nome){ toast('Informe o produto',true); return; }
  if(qtd<1){ toast('Quantidade inválida',true); return; }
  if(preco<=0){ toast('Informe o preço',true); return; }

  carrinho.push({nome,qtd,preco});
  // limpa campos
  $('in-produto').value=''; $('in-qtd').value='1'; $('in-preco').value='';
  $('in-produto').focus();
  renderCarrinho();
}

function removerItem(i){
  carrinho.splice(i,1);
  renderCarrinho();
}

function totalCarrinho(){
  return carrinho.reduce((s,it)=>s+it.qtd*it.preco,0);
}

function renderCarrinho(){
  const lista=$('lista-carrinho');
  const total=totalCarrinho();
  if(carrinho.length===0){
    $('card-carrinho').style.display='none';
    $('carrinho-vazio').style.display='block';
    return;
  }
  $('card-carrinho').style.display='block';
  $('carrinho-vazio').style.display='none';
  lista.innerHTML=carrinho.map((it,i)=>`
    <div class="item-carrinho">
      <div class="ic-info">
        <div class="ic-nome">${escapeHtml(it.nome)}</div>
        <div class="ic-det">${it.qtd} × ${money(it.preco)}</div>
      </div>
      <div class="ic-total">${money(it.qtd*it.preco)}</div>
      <button class="ic-x" onclick="removerItem(${i})">✕</button>
    </div>`).join('');
  $('carrinho-total').textContent=money(total);
}

/* ------------------------------------------------------------
   11) PAGAMENTO
------------------------------------------------------------ */
function abrirPagamento(){
  if(carrinho.length===0){ toast('Carrinho vazio',true); return; }
  pagamentos=[];
  $('pag-total').textContent=money(totalCarrinho());
  document.querySelectorAll('.forma-btn').forEach(b=>b.classList.remove('ativa'));
  $('pags-valores').innerHTML='';
  $('dinheiro-troco').style.display='none';
  $('in-recebido').value='';
  $('resumo-pag').textContent='';
  irTelaSimples('tela-pagamento');
}

function voltarVender(){ irTelaSimples('tela-vender'); }

function irTelaSimples(id){
  document.querySelectorAll('.tela').forEach(t=>t.classList.remove('ativa'));
  $(id).classList.add('ativa');
  window.scrollTo(0,0);
}

function toggleForma(forma){
  const btn=document.querySelector(`.forma-btn[data-forma="${forma}"]`);
  const existe=pagamentos.find(p=>p.forma===forma);
  if(existe){
    pagamentos=pagamentos.filter(p=>p.forma!==forma);
    btn.classList.remove('ativa');
  } else {
    pagamentos.push({forma, valor:0});
    btn.classList.add('ativa');
  }
  renderPagamentos();
}

function renderPagamentos(){
  const el=$('pags-valores');
  const total=totalCarrinho();
  // se só uma forma, preenche automático com o total
  if(pagamentos.length===1){ pagamentos[0].valor=total; }

  if(pagamentos.length<=1){
    el.innerHTML=''; // não mostra campo de valor quando é uma forma só
  } else {
    el.innerHTML=pagamentos.map((p,i)=>`
      <div class="pag-linha">
        <span class="pl-nome">${p.forma}</span>
        <input type="text" class="input" inputmode="decimal" placeholder="0,00"
          value="${p.valor?p.valor.toLocaleString('pt-BR',{minimumFractionDigits:2}):''}"
          oninput="setPagValor(${i}, this.value)">
      </div>`).join('');
  }

  // troco em dinheiro
  const temDinheiro=pagamentos.some(p=>p.forma==='Dinheiro');
  $('dinheiro-troco').style.display = temDinheiro ? 'block' : 'none';
  if(temDinheiro) calcularTroco();

  atualizarResumoPag();
}

function setPagValor(i, v){
  pagamentos[i].valor=parseMoney(v);
  if(pagamentos.some(p=>p.forma==='Dinheiro')) calcularTroco();
  atualizarResumoPag();
}

function valorDinheiroDevido(){
  const p=pagamentos.find(x=>x.forma==='Dinheiro');
  return p?p.valor:0;
}

function calcularTroco(){
  const recebido=parseMoney($('in-recebido').value);
  const devido=valorDinheiroDevido();
  const troco=Math.max(0, recebido-devido);
  $('troco-val').textContent=money(troco);
}

function atualizarResumoPag(){
  const total=totalCarrinho();
  const somaPag=pagamentos.reduce((s,p)=>s+p.valor,0);
  const dif=total-somaPag;
  const r=$('resumo-pag');
  if(pagamentos.length<=1){ r.textContent=''; return; }
  if(Math.abs(dif)<0.01){
    r.innerHTML=`✓ Pagamento fecha certinho: <b>${money(total)}</b>`;
  } else if(dif>0){
    r.innerHTML=`Falta distribuir <b>${money(dif)}</b>`;
  } else {
    r.innerHTML=`Passou <b>${money(-dif)}</b> do total`;
  }
}

async function finalizarVenda(){
  const total=totalCarrinho();
  if(pagamentos.length===0){ toast('Escolha a forma de pagamento',true); return; }

  // validação do split
  if(pagamentos.length>1){
    const soma=pagamentos.reduce((s,p)=>s+p.valor,0);
    if(Math.abs(soma-total)>=0.01){ toast('Os valores não somam o total',true); return; }
  }
  // valor recebido em dinheiro (pra troco) — opcional
  let recebido=null;
  if(pagamentos.some(p=>p.forma==='Dinheiro')){
    recebido=parseMoney($('in-recebido').value)||valorDinheiroDevido();
  }

  const btn=$('btn-finalizar'); btn.disabled=true; btn.textContent='Salvando...';

  const venda={
    id: uid(),
    vendedor: vendedorAtual,
    itens: carrinho.map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco})),
    pagamentos: pagamentos.map(p=>({forma:p.forma,valor:p.valor})),
    total: total,
    recebido_dinheiro: recebido,
    criado_em: new Date().toISOString(),
    data: hojeISO(new Date())
  };

  try{
    if(USANDO_NUVEM){
      const {data,error}=await sb.from('vendas').insert({
        vendedor:venda.vendedor, itens:venda.itens, pagamentos:venda.pagamentos,
        total:venda.total, recebido_dinheiro:venda.recebido_dinheiro,
        data:venda.data
      }).select().single();
      if(error) throw error;
      venda.id=data.id;
      venda.criado_em=data.criado_em||venda.criado_em;
      // upsert produtos no catálogo
      await sincronizarProdutosNuvem();
    }
    vendas.unshift(venda);
    atualizarCatalogoLocal();
    salvarLocal();

    toast('Venda registrada! ✓');
    carrinho=[]; pagamentos=[];
    renderCarrinho();
    renderDiario(); renderDashboard();
    irTab('tela-diario');
  }catch(e){
    console.error(e);
    toast('Erro ao salvar a venda',true);
  }finally{
    btn.disabled=false; btn.textContent='Finalizar venda ✓';
  }
}

/* Atualiza catálogo local a partir do carrinho recém-vendido */
function atualizarCatalogoLocal(){
  carrinho.forEach(it=>{
    const ex=produtos.find(p=>p.nome.toLowerCase()===it.nome.toLowerCase());
    if(ex){ ex.ultimo_preco=it.preco; ex.vezes=(ex.vezes||0)+1; }
    else produtos.push({nome:it.nome, ultimo_preco:it.preco, vezes:1});
  });
}

async function sincronizarProdutosNuvem(){
  for(const it of carrinho){
    const ex=produtos.find(p=>p.nome.toLowerCase()===it.nome.toLowerCase());
    if(ex){
      await sb.from('produtos').update({ultimo_preco:it.preco, vezes:(ex.vezes||0)+1}).eq('nome',ex.nome);
    } else {
      await sb.from('produtos').insert({nome:it.nome, ultimo_preco:it.preco, vezes:1});
    }
  }
}

/* ------------------------------------------------------------
   12) RELATÓRIO DIÁRIO
------------------------------------------------------------ */
function mudarDia(delta){
  diaAtual.setDate(diaAtual.getDate()+delta);
  renderDiario();
}
function setDia(v){
  if(!v) return;
  const [y,m,d]=v.split('-').map(Number);
  diaAtual=new Date(y,m-1,d);
  renderDiario();
}

function vendasDoDia(dateObj){
  const iso=hojeISO(dateObj);
  return vendas.filter(v=>(v.data||(v.criado_em||'').slice(0,10))===iso);
}

function renderDiario(){
  const iso=hojeISO(diaAtual);
  const hoje=hojeISO(new Date());
  const ontem=hojeISO(new Date(Date.now()-86400000));
  let label;
  if(iso===hoje) label='Hoje';
  else if(iso===ontem) label='Ontem';
  else label=diaAtual.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
  const lbl=$('dia-label');
  lbl.childNodes[0].nodeValue=label+' ';

  const lista=vendasDoDia(diaAtual).sort((a,b)=>(b.criado_em||'').localeCompare(a.criado_em||''));
  const fat=lista.reduce((s,v)=>s+Number(v.total||0),0);
  $('dia-fat').textContent=moneyShort(fat);
  $('dia-qtd').textContent=lista.length;

  const el=$('diario-lista');
  if(lista.length===0){
    el.innerHTML=`<div class="vazio"><div class="v-ico">📭</div><div class="v-txt">Sem vendas neste dia</div></div>`;
    return;
  }
  el.innerHTML=lista.map(v=>{
    const hora=new Date(v.criado_em).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const itens=(v.itens||[]).map(it=>`<div class="vc-item"><span>${escapeHtml(it.nome)} <span class="q">×${it.qtd}</span></span><span>${money(it.qtd*it.preco)}</span></div>`).join('');
    const pags=(v.pagamentos||[]).map(p=>`<span class="tag">${p.forma}${v.pagamentos.length>1?' '+money(p.valor):''}</span>`).join('');
    return `<div class="venda-card">
      <div class="vc-topo">
        <div><div class="vc-hora">🕐 ${hora}</div><div class="vc-vendedor">👤 ${escapeHtml(v.vendedor||'—')}</div></div>
        <div class="vc-total">${money(v.total)}</div>
      </div>
      <div class="vc-itens">${itens}</div>
      <div class="vc-pags">${pags}</div>
      <div class="vc-acoes">
        <button class="a-editar" onclick="editarVenda('${v.id}')">✎ Editar</button>
        <button class="a-excluir" onclick="excluirVenda('${v.id}')">🗑 Excluir</button>
      </div>
    </div>`;
  }).join('');
}

function excluirVenda(id){
  const v=vendas.find(x=>String(x.id)===String(id));
  if(!v) return;
  abrirModal('Excluir venda', `Excluir esta venda de ${money(v.total)}? Esta ação não pode ser desfeita.`, async()=>{
    if(USANDO_NUVEM) await sb.from('vendas').delete().eq('id',id);
    vendas=vendas.filter(x=>String(x.id)!==String(id));
    salvarLocal();
    fecharModal();
    renderDiario(); renderDashboard();
    toast('Venda excluída');
  });
}

/* Editar = recarrega a venda no carrinho e exclui a antiga */
function editarVenda(id){
  const v=vendas.find(x=>String(x.id)===String(id));
  if(!v) return;
  abrirModal('Editar venda','A venda voltará para o carrinho para você corrigir. A versão antiga será removida. Continuar?', async()=>{
    if(USANDO_NUVEM) await sb.from('vendas').delete().eq('id',id);
    vendas=vendas.filter(x=>String(x.id)!==String(id));
    salvarLocal();
    carrinho=(v.itens||[]).map(it=>({nome:it.nome,qtd:it.qtd,preco:it.preco}));
    pagamentos=[];
    fecharModal();
    renderCarrinho();
    renderDiario(); renderDashboard();
    irTab('tela-vender');
    toast('Venda no carrinho para edição');
  });
}

/* ------------------------------------------------------------
   13) DASHBOARD MENSAL
------------------------------------------------------------ */
function mudarMes(delta){
  mesAtual.setMonth(mesAtual.getMonth()+delta);
  renderDashboard();
}

function vendasDoMes(dateObj){
  const y=dateObj.getFullYear(), m=dateObj.getMonth();
  return vendas.filter(v=>{
    const d=v.data?new Date(v.data+'T12:00:00'):new Date(v.criado_em);
    return d.getFullYear()===y && d.getMonth()===m;
  });
}

function renderDashboard(){
  $('mes-label').textContent=mesAtual.toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const lista=vendasDoMes(mesAtual);
  const fat=lista.reduce((s,v)=>s+Number(v.total||0),0);
  const n=lista.length;
  const ticket=n?fat/n:0;

  $('dash-fat').textContent=moneyShort(fat);
  $('dash-fat-sub').textContent=n?`${n} venda${n>1?'s':''} no mês`:'Sem vendas ainda';
  $('dash-nvendas').textContent=n;
  $('dash-ticket').textContent=moneyShort(ticket);

  // Top produtos (por faturamento)
  const prodMap={};
  lista.forEach(v=>(v.itens||[]).forEach(it=>{
    const k=it.nome;
    if(!prodMap[k]) prodMap[k]={nome:k,qtd:0,fat:0};
    prodMap[k].qtd+=it.qtd;
    prodMap[k].fat+=it.qtd*it.preco;
  }));
  const topProd=Object.values(prodMap).sort((a,b)=>b.fat-a.fat).slice(0,5);
  const maxProd=topProd[0]?topProd[0].fat:1;
  $('dash-produtos').innerHTML = topProd.length ? topProd.map(p=>`
    <div class="barra-item">
      <div class="bi-topo"><span class="bi-nome">${escapeHtml(p.nome)}</span><span class="bi-val">${money(p.fat)}</span></div>
      <div class="barra-track"><div class="barra-fill" style="width:${(p.fat/maxProd*100).toFixed(0)}%"></div></div>
    </div>`).join('') : semDados();

  // Por vendedor
  const vendMap={};
  lista.forEach(v=>{
    const k=v.vendedor||'—';
    if(!vendMap[k]) vendMap[k]={nome:k,fat:0,qtd:0};
    vendMap[k].fat+=Number(v.total||0);
    vendMap[k].qtd++;
  });
  const topVend=Object.values(vendMap).sort((a,b)=>b.fat-a.fat);
  $('dash-vendedores').innerHTML = topVend.length ? topVend.map((v,i)=>`
    <div class="rank">
      <span class="r-pos">${i+1}º</span>
      <span class="r-nome">${escapeHtml(v.nome)}<div class="r-qtd">${v.qtd} venda${v.qtd>1?'s':''}</div></span>
      <span class="r-val">${money(v.fat)}</span>
    </div>`).join('') : semDados();

  // Por forma de pagamento
  const formaMap={};
  lista.forEach(v=>(v.pagamentos||[]).forEach(p=>{
    formaMap[p.forma]=(formaMap[p.forma]||0)+Number(p.valor||0);
  }));
  const formas=Object.entries(formaMap).map(([forma,val])=>({forma,val})).sort((a,b)=>b.val-a.val);
  const totalFormas=formas.reduce((s,f)=>s+f.val,0)||1;
  $('dash-formas').innerHTML = formas.length ? formas.map(f=>`
    <div class="barra-item">
      <div class="bi-topo"><span class="bi-nome">${f.forma}</span><span class="bi-val">${money(f.val)} <span style="color:var(--cinza);font-weight:600">(${(f.val/totalFormas*100).toFixed(0)}%)</span></span></div>
      <div class="barra-track"><div class="barra-fill" style="width:${(f.val/totalFormas*100).toFixed(0)}%"></div></div>
    </div>`).join('') : semDados();
}

function semDados(){ return '<div class="dica" style="margin:4px 0">Sem dados neste mês.</div>'; }

/* ------------------------------------------------------------
   14) MODAL
------------------------------------------------------------ */
let modalCallback=null;
function abrirModal(titulo, texto, onConfirmar){
  $('modal-titulo').textContent=titulo;
  $('modal-texto').textContent=texto;
  modalCallback=onConfirmar;
  $('modal-bg').classList.add('mostrar');
}
function fecharModal(){ $('modal-bg').classList.remove('mostrar'); modalCallback=null; }
$('modal-confirmar').addEventListener('click',()=>{ if(modalCallback) modalCallback(); });
$('modal-bg').addEventListener('click',(e)=>{ if(e.target===$('modal-bg')) fecharModal(); });

/* ------------------------------------------------------------
   15) UTIL
------------------------------------------------------------ */
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// formata preço enquanto digita (vírgula decimal)
['in-preco','in-recebido'].forEach(id=>{
  document.addEventListener('input',(e)=>{
    if(e.target && e.target.id===id){
      // deixa só números e vírgula
      let v=e.target.value.replace(/[^\d,]/g,'');
      e.target.value=v;
    }
  });
});

/* start */
init();
