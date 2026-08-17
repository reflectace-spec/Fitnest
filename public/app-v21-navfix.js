const app=document.getElementById('app');
const title=document.getElementById('pageTitle');
if(app&&title){
  new MutationObserver(()=>{
    if(title.textContent==='Ernährung'&&app.dataset.nutritionBuild&&!app.querySelector('.nutrition-hero')) delete app.dataset.nutritionBuild;
  }).observe(app,{childList:true});
}
