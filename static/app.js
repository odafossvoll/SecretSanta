const $=s=>document.querySelector(s);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let me=null, round=null, audio=null, musicTimer=null;

function snow(){const host=$('#snow');for(let i=0;i<55;i++){const f=document.createElement('i');f.className='snowflake';f.textContent=i%4?'•':'❄';f.style.left=Math.random()*100+'%';f.style.fontSize=4+Math.random()*10+'px';f.style.animationDuration=7+Math.random()*12+'s';f.style.animationDelay=-Math.random()*18+'s';f.style.setProperty('--drift',`${-50+Math.random()*100}px`);host.append(f)}}
function sparkle(n=18){const host=$('#sparkles');for(let i=0;i<n;i++){const s=document.createElement('i');s.className='spark';s.textContent=i%2?'✦':'✧';s.style.setProperty('--x',`${-100+Math.random()*200}px`);s.style.setProperty('--y',`${-100+Math.random()*150}px`);s.style.animationDelay=Math.random()*.5+'s';host.append(s);setTimeout(()=>s.remove(),2200)}}
async function request(url,options={}){const r=await fetch(url,{headers:{'Content-Type':'application/json'},...options});const data=await r.json();if(!r.ok)throw new Error(data.error||'Noe gikk galt');return data}
function speak(text){$('#speech').textContent=text}
function tone(freq,duration=.12,type='sine',gain=.04){if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(gain,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}
function startMusic(){audio ||= new AudioContext();if(audio.state==='suspended')audio.resume();$('#sound').classList.add('on');$('#sound').setAttribute('aria-label','Slå julemusikk av');const notes=[392,494,587,494,440,523,659,523],play=()=>{if(!musicTimer)return;notes.forEach((n,i)=>setTimeout(()=>tone(n,.6,'sine',.018),i*430))};musicTimer=setInterval(play,notes.length*430);play()}
function stopMusic(){clearInterval(musicTimer);musicTimer=null;$('#sound').classList.remove('on');$('#sound').setAttribute('aria-label','Slå julemusikk på')}

function countdown(){if(!round)return;const target=new Date(round.christmasDate).getTime();const render=()=>{let d=Math.max(0,target-Date.now()),days=Math.floor(d/864e5);d%=864e5;const hrs=Math.floor(d/36e5);d%=36e5;const min=Math.floor(d/6e4);$('#countdown').innerHTML=`<b>${days}</b> dager <b>${hrs}</b> timer <b>${min}</b> min`};render();setInterval(render,30000)}
function showResult(data){me={...me,...data,opened:true};$('#loginCard,#waitingCard').classList.add('hidden');$('#resultCard').classList.remove('hidden');$('#resultLead').textContent=`Ho ho ho! ${data.name}, du skal kjøpe julegave til …`;$('#resultName').textContent=data.recipient.name;$('#paperName').textContent=data.recipient.name;$('#paper').classList.add('show');const w=data.recipient.wishlist;$('#recipientWish').textContent=w||'';$('#recipientWish').classList.toggle('hidden',!w);speak('En perfekt julevenn!');sparkle(35);$('#scene').classList.add('celebrate');[659,784,988].forEach((n,i)=>setTimeout(()=>tone(n,.4,'triangle',.06),i*170));}

async function reveal(){
  $('#loginCard').classList.add('hidden');$('#waitingCard').classList.remove('hidden');const scene=$('#scene');scene.classList.add('searching');
  const beats=[['Hmm … hvem skal det bli, tro?',900],['Nissen leter dypt i sekken …',1250],['Oi! Her fant jeg noe!',1000],['Er du klar for å møte din julevenn?',900]];
  let resultPromise=request('/api/reveal',{method:'POST',body:'{}'});
  for(const [text,ms] of beats){speak(text);$('#waitingTitle').textContent=text;sparkle(6);tone(180+Math.random()*90,.08,'square',.018);await wait(ms)}
  const result=await resultPromise;scene.classList.remove('searching');showResult(result);
}

snow();
request('/api/guest/logout',{method:'POST',body:'{}'}).catch(()=>{}).finally(()=>{
  request('/api/public').then(d=>{round=d.round;if(round){$('#intro').textContent=`Ho ho ho! Velkommen til ${round.title}. Skriv inn navnet ditt og den private koden din for å finne ut hvem du skal overraske!`;countdown();if(round.budget)$('#intro').textContent+=` Årets gavebudsjett er opptil ${round.budget} kr.`}}).catch(()=>{});
});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{const d=await request('/api/identify',{method:'POST',body:JSON.stringify({name:$('#name').value,code:$('#code').value})});me=d;history.replaceState({},'',location.pathname);await reveal()}catch(err){$('#loginError').textContent=err.message;speak('Hmm, den koden kjenner jeg ikke.')}});
$('#sound').onclick=()=>musicTimer?stopMusic():startMusic();
$('#hideResult').onclick=async()=>{await request('/api/guest/logout',{method:'POST',body:'{}'}).catch(()=>{});location.reload()};
$('#copyResult').onclick=async()=>{if(!me?.recipient)return;await navigator.clipboard.writeText(`Min hemmelige julevenn er ${me.recipient.name}. Hysj!`);$('#copyResult').textContent='Kopiert ✓';setTimeout(()=>$('#copyResult').textContent='Kopier privat',1800)};
$('#saveWishlist').onclick=async()=>{try{await request('/api/wishlist',{method:'PUT',body:JSON.stringify({wishlist:$('#wishlist').value})});$('#wishStatus').textContent='Lagret ✓'}catch(e){$('#wishStatus').textContent=e.message}};
