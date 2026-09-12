import('./app.js').catch(error=>{
 const root=document.querySelector('#app');root.replaceChildren();
 const box=document.createElement('section');box.className='loading';
 const title=document.createElement('h1');title.textContent='MindMoth could not open.';
 const detail=document.createElement('p');detail.textContent=error.message;
 const button=document.createElement('button');button.className='button primary';button.textContent='Try again';button.addEventListener('click',()=>location.reload());
 const help=document.createElement('p');help.textContent='Reload MindMoth in your browser’s extensions page, then reopen this tab. Your saved data is not deleted.';
 box.append(title,detail,button,help);root.append(box);
});
