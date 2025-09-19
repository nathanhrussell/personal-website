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

  // Contrast check (basic, logs results)
  function luminance(r,g,b){
    const a = [r,g,b].map(v=>{
      v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4);
    });
    return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
  }
  function hexToRgb(hex){
    const h = hex.replace('#','');
    return [parseInt(h.substring(0,2),16), parseInt(h.substring(2,4),16), parseInt(h.substring(4,6),16)];
  }
  function contrast(hex1,hex2){
    const L1 = luminance(...hexToRgb(hex1));
    const L2 = luminance(...hexToRgb(hex2));
    return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
  }
  try{
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue('--bg').trim() || '#ffffff';
    const text = style.getPropertyValue('--text').trim() || '#111827';
    const ratio = contrast(bg,text);
    console.log('Contrast ratio (text vs bg):', ratio.toFixed(2));
    console.log('WCAG AA (normal text) pass:', ratio>=4.5);
  }catch(e){ console.warn('Contrast check failed', e); }
});

// Smooth scroll with offset and active nav highlighting
document.addEventListener('DOMContentLoaded', ()=>{
  const header = document.getElementById('siteHeader');
  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const sections = navLinks.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);

  function headerHeight(){ return header ? header.getBoundingClientRect().height : 0; }

  // Adjust scroll to account for header when clicking anchors
  navLinks.forEach(a=>{
    a.addEventListener('click', (e)=>{
      const href = a.getAttribute('href');
      if(href && href.startsWith('#')){
        const target = document.querySelector(href);
        if(target){
          e.preventDefault();
          const y = target.getBoundingClientRect().top + window.scrollY - headerHeight() - 8;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      }
    });
  });

  // Observe sections to toggle active link
  const obs = new IntersectionObserver((entries)=>{
    entries.forEach(ent=>{
      const id = ent.target.id;
      const link = document.querySelector(`.nav-link[href="#${id}"]`);
      if(!link) return;
      if(ent.isIntersecting){
        navLinks.forEach(l=>l.classList.remove('active'));
        link.classList.add('active');
      }
    });
  }, { rootMargin: `-${headerHeight()}px 0px -40% 0px`, threshold: 0.2 });

  sections.forEach(s=>obs.observe(s));
});

  // Mockup interactivity: click/tap to cycle images, keyboard support for accessibility
  document.addEventListener('DOMContentLoaded', ()=>{
    function showIndex(container, index){
      const imgs = Array.from(container.querySelectorAll('img'));
      imgs.forEach((img,i)=>{
        img.style.opacity = i===index ? '1' : '0';
        img.style.transform = i===index ? 'scale(1)' : 'scale(.98)';
      });
      container.setAttribute('data-mockup-index', String(index));
    }

    document.querySelectorAll('.mockup').forEach(container=>{
      // ensure initial state
      showIndex(container, Number(container.getAttribute('data-mockup-index')||0));

      // click or tap cycles images
      container.addEventListener('click', ()=>{
        const imgs = container.querySelectorAll('img');
        if(imgs.length<2) return;
        const idx = (Number(container.getAttribute('data-mockup-index')||0) + 1) % imgs.length;
        showIndex(container, idx);
      });

      // keyboard: Enter or Space toggles
      container.addEventListener('keydown', (e)=>{
        if(e.key === 'Enter' || e.key === ' '){
          e.preventDefault();
          container.click();
        }
      });
    });
  });
