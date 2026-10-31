/* Original local vector characters, decorative and independent of the OS emoji font. */
(()=>{
 'use strict';
 const characters=['elf','mage','knight','nekomata','fox','dragon','slime','forest-spirit'];
 window.ALM_CALENDAR_ART=Object.freeze({create(date){
  const character=characters[(date.getFullYear()+date.getMonth()*31+date.getDate())%characters.length];
  const span=document.createElement('span'),image=document.createElement('img');
  span.className='calendar-companion';span.dataset.character=character;span.setAttribute('aria-hidden','true');
  image.src='/assets/calendar/'+character+'.svg';image.alt='';image.width=96;image.height=110;image.loading='lazy';image.decoding='async';span.append(image);return span;
 }});
})();
