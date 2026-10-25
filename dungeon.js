/* Optional dungeon mode for Rumah Mungil. */
(function(){
const b=document.createElement('button');b.className='chip';b.textContent='⚔️ Dungeon';b.id='dungeonBtn';const a=document.querySelector('.acts');if(a)a.prepend(b);
b.onclick=function(){alert('Dungeon RPG sedang disiapkan. Sari akan ikut otomatis.')};
})();
