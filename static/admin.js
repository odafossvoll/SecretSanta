const $=s=>document.querySelector(s);let state=null,setup=false;
const API_BASE=String(window.SECRET_SANTA_CONFIG?.apiBase||'').replace(/\/$/,'');
const HAS_API=Boolean(API_BASE)||!location.hostname.endsWith('.github.io');
function snow(){const h=$('#snow');for(let i=0;i<35;i++){const f=document.createElement('i');f.className='snowflake';f.textContent='•';f.style.left=Math.random()*100+'%';f.style.animationDuration=8+Math.random()*10+'s';f.style.animationDelay=-Math.random()*15+'s';f.style.setProperty('--drift',`${-40+Math.random()*80}px`);h.append(f)}}
async function request(url,options={}){if(!HAS_API)throw new Error('Den sikre serveren er ikke koblet til ennå.');const r=await fetch(`${API_BASE}${url}`,{headers:{'Content-Type':'application/json'},credentials:'include',...options});const d=await r.json();if(!r.ok)throw new Error(d.error||'Noe gikk galt');return d}
function localDate(value){if(!value)return'';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function escape(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function render(s){state=s;const r=s.round,locked=r.status!=='draft';$('#roundHeading').textContent=r.title;$('#participantCount').textContent=s.participants.length;$('#openedCount').textContent=s.participants.filter(p=>p.openedAt).length;$('#roundTitle').value=r.title;$('#budget').value=r.budget??'';$('#opensAt').value=localDate(r.opensAt);$('#christmasDate').value=localDate(r.christmasDate);$('#roundForm').querySelectorAll('input,button').forEach(x=>x.disabled=locked);$('#addForm').classList.toggle('hidden',locked);$('#ruleForm').classList.toggle('hidden',locked);
  $('#people').innerHTML=s.participants.map(p=>`<div class="person ${p.openedAt?'opened':''}" data-id="${p.id}"><div><b>${escape(p.name)}</b><br><small>${p.openedAt?'Har åpnet resultatet ✓':'Venter fortsatt'}</small></div>${locked?'':`<button class="icon-btn rename" title="Rediger">✎</button><button class="icon-btn remove" title="Fjern">×</button>`}<button class="icon-btn recode" title="Lag ny kode">⌘</button></div>`).join('')||'<p>Ingen deltakere ennå.</p>';
  const opts=s.participants.map(p=>`<option value="${p.id}">${escape(p.name)}</option>`).join('');$('#giver').innerHTML=opts;$('#receiver').innerHTML=opts;
  $('#rules').innerHTML=s.exclusions.map(x=>{const g=s.participants.find(p=>p.id===x.giverId),t=s.participants.find(p=>p.id===x.receiverId);return `<div class="rule" data-g="${x.giverId}" data-r="${x.receiverId}"><span>${escape(g?.name||'?')} → ikke ${escape(t?.name||'?')}</span>${locked?'':'<button class="icon-btn delrule">×</button>'}</div>`}).join('');
  $('#publish').classList.toggle('hidden',locked);$('#newRound').classList.toggle('hidden',!locked);$('#launchCopy').textContent=locked?'Runden er publisert og fordelingen ligger trygt på serveren. Du kan følge med på hvem som har åpnet resultatet.':'Når du publiserer, låses deltakerlisten og alle får én unik julevenn.';
}
async function load(){
  $('#auth').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  try{
    render(await request('/api/admin/state'));
  }catch(err){
    $('#adminStatus').textContent=`Kunne ikke laste administrasjonen: ${err.message}. Oppdater siden og prøv igjen.`;
    $('#participantCount').textContent='–';
    $('#openedCount').textContent='–';
  }
}
snow();
if(!HAS_API){
  $('#authTitle').textContent='Sikker backend kreves';
  $('#authHint').textContent='GitHub Pages kan vise juleverkstedet, men kan ikke lagre passord, deltakere eller hemmelige tildelinger. Konfigurer SECRET_SANTA_API_URL for å aktivere nissekontoret.';
  $('#authForm').classList.add('hidden');
}
request('/api/admin/status').then(d=>{setup=d.setupRequired;if(setup){$('#authTitle').textContent='Opprett hovednøkkel';$('#authHint').textContent='Første gang: velg et administratorpassord på minst 10 tegn. Dette kan bare gjøres på servermaskinen.'}if(d.authenticated)load()}).catch(err=>{$('#authError').textContent=`Serverfeil: ${err.message}`});
$('#authForm').onsubmit=async e=>{e.preventDefault();try{await request(setup?'/api/admin/setup':'/api/admin/login',{method:'POST',body:JSON.stringify({password:$('#password').value})});await load()}catch(err){$('#authError').textContent=err.message}};
$('#logout').onclick=async()=>{await request('/api/admin/logout',{method:'POST'});location.reload()};
$('#roundForm').onsubmit=async e=>{e.preventDefault();try{render(await request('/api/admin/round',{method:'PATCH',body:JSON.stringify({title:$('#roundTitle').value,budget:$('#budget').value,opensAt:$('#opensAt').value?new Date($('#opensAt').value).toISOString():'',christmasDate:new Date($('#christmasDate').value).toISOString()})}))}catch(err){$('#adminStatus').textContent=err.message}};
$('#addForm').onsubmit=async e=>{
  e.preventDefault();
  const names=$('#newNames').value.split(/\n|,/).map(x=>x.trim()).filter(Boolean);
  try{
    const d=await request('/api/admin/participants',{method:'POST',body:JSON.stringify({names})});
    render(d.state);
    $('#newNames').value='';
    if(d.created.length){
      $('#createdCodes').classList.remove('hidden');
      $('#createdCodes').innerHTML='<b>Kopier kodene nå:</b><br>'+d.created.map(x=>`${escape(x.name)}: <code>${x.code}</code>`).join('<br>');
    }
  }catch(err){$('#adminStatus').textContent=err.message}
};
$('#people').onclick=async e=>{const row=e.target.closest('.person');if(!row)return;const id=row.dataset.id;try{if(e.target.classList.contains('remove')){if(confirm('Fjerne deltakeren?'))render(await request(`/api/admin/participants/${id}`,{method:'DELETE'}))}else if(e.target.classList.contains('rename')){const name=prompt('Riktig navn:',row.querySelector('b').textContent);if(name)render(await request(`/api/admin/participants/${id}`,{method:'PATCH',body:JSON.stringify({name})}))}else if(e.target.classList.contains('recode')){if(confirm('Den gamle koden vil slutte å virke. Lage en ny?')){const d=await request(`/api/admin/participants/${id}/code`,{method:'POST'});$('#createdCodes').classList.remove('hidden');$('#createdCodes').innerHTML=`Ny kode for ${escape(row.querySelector('b').textContent)}: <code>${d.code}</code>`}}}catch(err){$('#adminStatus').textContent=err.message}};
$('#ruleForm').onsubmit=async e=>{e.preventDefault();try{render(await request('/api/admin/exclusions',{method:'PUT',body:JSON.stringify({giverId:$('#giver').value,receiverId:$('#receiver').value})}))}catch(err){$('#adminStatus').textContent=err.message}};
$('#rules').onclick=async e=>{if(!e.target.classList.contains('delrule'))return;const row=e.target.closest('.rule');render(await request('/api/admin/exclusions',{method:'DELETE',body:JSON.stringify({giverId:row.dataset.g,receiverId:row.dataset.r})}))};
$('#publish').onclick=async()=>{if(!confirm('Publisere runden? Deltakerlisten låses og kan ikke endres etterpå.'))return;try{render(await request('/api/admin/publish',{method:'POST'}));$('#adminStatus').textContent='Runden er publisert! ✦'}catch(err){$('#adminStatus').textContent=err.message}};
$('#newRound').onclick=async()=>{if(!confirm('Starte en helt ny runde? Den gamle arkiveres.'))return;const year=new Date().getFullYear()+1;render(await request('/api/admin/round/new',{method:'POST',body:JSON.stringify({year})}))};
