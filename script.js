// script.js — theme toggle, reveal on scroll, and contrib graph
const root = document.documentElement;
const storageKey = "theme";
const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

function setTheme(theme){
  root.setAttribute("data-theme", theme);
  localStorage.setItem(storageKey, theme);
  const btn = document.getElementById("themeToggle");
  const icon = document.getElementById("themeIcon");
  if(btn && icon){
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    icon.textContent = theme === "dark" ? "☀️" : "🌙";
  }
}

function initTheme(){
  const saved = localStorage.getItem(storageKey);
  setTheme(saved || (prefersDark ? "dark" : "light"));
}

document.addEventListener("DOMContentLoaded", ()=>{
  initTheme();
  document.getElementById("themeToggle")?.addEventListener("click", ()=>{
    setTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // Reveal on scroll
  const observer = new IntersectionObserver((entries, observer)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add('reveal');
        observer.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });

  document.querySelectorAll('[data-reveal]').forEach(el=>{
    el.classList.add('opacity-0','translate-y-6','transition','duration-700');
    observer.observe(el);
  });

  // Contribution graph
  (function makeContribGrid(){
    const svg = document.getElementById('contribSVG'); if(!svg) return;
    const cols=53, rows=7, size=10, gap=2;
    const light=["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"];
    const dark =["#161b22","#0e4429","#006d32","#26a641","#39d353"];
    const palette=()=> document.documentElement.getAttribute('data-theme')==='dark' ? dark : light;

    function draw(){
      svg.innerHTML = '';
      const p = palette();
      for(let c=0;c<cols;c++){
        for(let r=0;r<rows;r++){
          const lvl = Math.floor(Math.random()*p.length);
          const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
          rect.setAttribute('x', String(c*(size+gap)));
          rect.setAttribute('y', String(r*(size+gap)));
          rect.setAttribute('width', String(size));
          rect.setAttribute('height', String(size));
          rect.setAttribute('rx','2');
          rect.setAttribute('fill', p[lvl]);
          rect.style.opacity='0'; rect.style.transformOrigin='center';
          svg.appendChild(rect);
          setTimeout(()=>{
            rect.style.transition='opacity .4s ease, transform .4s ease';
            rect.style.opacity='1'; rect.style.transform='scale(1)';
          }, (c*30)+(r*10));
        }
      }
    }

    new MutationObserver(draw).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
    draw();
  })();
});
