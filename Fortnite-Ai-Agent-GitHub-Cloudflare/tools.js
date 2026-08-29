 => {
  "use strict";

  const overlay=document.getElementById("toolsOverlay");
  const back=document.getElementById("toolsBackBtn");
  const tabs=document.getElementById("toolsTabs");
  const content=document.getElementById("toolsContent");
  const guestBanner=document.getElementById("guestLoginBanner");
  const guestLoginBtn=document.getElementById("guestLoginBtn");
  const DB=window.FORTNITE_AI_DB||{};

  const EXPORT_BASE="https://export-service-new.dillyapis.com/v1/export";
  const FORTNITE_API="https://fortnite-api.com/v2/cosmetics/br";

  let active="assets";
  let idData=null;
  let deviceData=null;
  let cosmeticResults=[];
  let cosmeticShown=0;
  const COSMETIC_PAGE=40;

  back.addEventListener("click",close);
  guestLoginBtn.addEventListener("click",()=>window.FortniteAgent?.showApiLogin());
  window.addEventListener("fortnite-login-mode-changed",updateGuestBanner);

  tabs.addEventListener("click",(event)=>{
    const b=event.target.closest(".tools-tab");if(!b)return;
    active=b.dataset.tool;
    [...tabs.querySelectorAll(".tools-tab")].forEach(x=>x.classList.toggle("active",x===b));
    render();
  });

  function open(){
    overlay.hidden=false;overlay.setAttribute("aria-hidden","false");
    updateGuestBanner();render();
  }
  function close(){overlay.hidden=true;overlay.setAttribute("aria-hidden","true");}
  function updateGuestBanner(){guestBanner.hidden=sessionStorage.getItem("fortniteAiAgent.loginMode.session")!=="guest";}

  async function render(){
    content.innerHTML='<div class="tool-section"><div class="tool-empty">Loading...</div></div>';
    try{
      if(active==="assets") return renderAssets();
      if(active==="ids") return renderIds();
      if(active==="devices") return renderDevices();
      if(active==="convert") return renderConverters();
      if(active==="path") return renderPathModifier();
      if(active==="cosmetic") return renderCosmetics();
    }catch(e){
      content.innerHTML=`<div class="tool-section"><div class="tool-empty">${escapeHtml(e.message||String(e))}</div></div>`;
    }
  }

  function renderAssets(){
    content.innerHTML=`
      <div class="tool-section">
        <h2>Fortnite Files</h2>
        <div class="tool-searchbar">
          <input id="assetQuery" placeholder="Search the full Fortnite database" />
          <button id="assetSearch" class="tool-button primary" type="button">Search</button>
        </div>
        <div class="tool-subtabs">
          <button class="tool-subtab active" data-scope="all">All</button>
          <button class="tool-subtab" data-scope="sm">SM_</button>
          <button class="tool-subtab" data-scope="m">M_ / MI_</button>
          <button class="tool-subtab" data-scope="meshes">Meshes</button>
          <button class="tool-subtab" data-scope="new">New</button>
        </div>
        <div id="assetResults" class="tool-empty">Type something to search.</div>
      </div>`;
    let scope="all";
    const input=content.querySelector("#assetQuery"),results=content.querySelector("#assetResults");
    content.querySelector(".tool-subtabs").addEventListener("click",(e)=>{
      const b=e.target.closest("[data-scope]");if(!b)return;
      scope=b.dataset.scope;[...content.querySelectorAll(".tool-subtab")].forEach(x=>x.classList.toggle("active",x===b));
    });
    const run=async()=>{
      const q=input.value.trim();if(!q)return;
      results.className="tool-empty";results.textContent="Searching...";
      try{
        const data=await window.FortniteAgent.searchDatabase(scope,q);
        if(!data.results?.length){results.textContent="No close results found.";return;}
        results.className="";
        results.innerHTML=data.results.slice(0,80).map(x=>pathCard(x.path,x.source)).join("");
        bindCopyButtons(results);
      }catch(e){results.className="tool-empty";results.textContent=e.message||"Search failed.";}
    };
    content.querySelector("#assetSearch").addEventListener("click",run);
    input.addEventListener("keydown",e=>{if(e.key==="Enter")run();});
  }

  async function renderIds(){
    if(!idData) idData=await fetchJson(DB.ids||"./database/id.json");
    const cards=[];walkIdData(idData,cards);
    content.innerHTML=`
      <div class="tool-section">
        <h2>Islands & IDs</h2>
        <div class="tool-searchbar"><input id="idSearch" placeholder="Search islands / IDs" /></div>
        <div id="idResults">${cards.slice(0,120).map(idCard).join("")}</div>
      </div>`;
    const input=content.querySelector("#idSearch"),results=content.querySelector("#idResults");
    input.addEventListener("input",()=>{
      const q=input.value.trim().toLowerCase();
      const filtered=!q?cards:cards.filter(x=>JSON.stringify(x).toLowerCase().includes(q));
      results.innerHTML=filtered.slice(0,180).map(idCard).join("")||'<div class="tool-empty">No results.</div>';
      bindCopyButtons(results);
    });
    bindCopyButtons(results);
  }

  async function renderDevices(){
    if(!deviceData) deviceData=await fetchJson(DB.devices||"./database/devicemeshs.json");
    const list=normalizeDeviceData(deviceData);

    content.innerHTML=`
      <div class="tool-section">
        <h2>Device Meshes</h2>
        <div class="tool-searchbar"><input id="deviceSearch" placeholder="Search device..." /></div>
        <div id="deviceResults">${list.slice(0,100).map(deviceCard).join("")}</div>
      </div>`;

    const input=content.querySelector("#deviceSearch"),results=content.querySelector("#deviceResults");

    input.addEventListener("input",()=>{
      const q=input.value.trim().toLowerCase();
      const filtered=!q?list:list.filter(x=>{
        const hay=[
          x.name,
          x.path,
          x.playset,
          ...(Array.isArray(x.tag)?x.tag:[])
        ].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });
      results.innerHTML=filtered.slice(0,160).map(deviceCard).join("")||'<div class="tool-empty">No results.</div>';
      bindCopyButtons(results);
      bindImageFallbacks(results);
    });

    bindCopyButtons(results);
    bindImageFallbacks(results);
  }

  function renderConverters(){
    const defs=[
      ["Emote to Animation","EID_DanceMoves","emote-animation"],
      ["Emote to Sequence","EID_DanceMoves","emote-sequence"],
      ["Emote to Audio","EID_DanceMoves","emote-audio"],
      ["Aura to VFX","SparksAura_BoomBox","aura-vfx"],
      ["MusicPack to Audio","MusicPack_001_Floss","music-audio"]
    ];
    content.innerHTML=`
      <div class="tool-section">
        <h2>Convert</h2>
        <p class="tool-note">These run here inside Fortnite Ai Agent. They do not open Th3Dry.</p>
        <div class="converter-grid">
          ${defs.map(([title,ph,type])=>`
            <div class="converter-card">
              <h3>${escapeHtml(title)}</h3>
              <input class="tool-input" data-convert-input="${type}" placeholder="${escapeAttr(ph)}" />
              <button class="tool-button primary" data-convert="${type}" type="button">Convert</button>
              <div class="tool-result" data-result="${type}">Ready.</div>
            </div>`).join("")}
        </div>
      </div>`;
    content.querySelectorAll("[data-convert]").forEach(btn=>{
      btn.addEventListener("click",()=>runConverter(btn.dataset.convert));
    });
    content.querySelectorAll("[data-convert-input]").forEach(input=>{
      input.addEventListener("keydown",e=>{if(e.key==="Enter")runConverter(input.dataset.convertInput);});
    });
  }

  async function runConverter(type){
    const input=content.querySelector(`[data-convert-input="${type}"]`);
    const result=content.querySelector(`[data-result="${type}"]`);
    const value=input.value.trim();
    if(!value){setResult(result,"Enter an ID or name.","error");return;}
    setResult(result,"Working...","loading");
    try{
      let data;
      if(type==="emote-animation") data=await emoteToAnimation(value);
      if(type==="emote-sequence") data=await emoteToSequence(value);
      if(type==="emote-audio") data=await emoteToAudio(value);
      if(type==="aura-vfx") data=await auraToVfx(value);
      if(type==="music-audio") data=await musicToAudio(value);
      if(!data||(Array.isArray(data)&&!data.length)){setResult(result,"No data found.","error");return;}
      const text=Array.isArray(data)?data.join("\n"):typeof data==="object"?Object.entries(data).map(([k,v])=>`${capitalize(k)}: ${v}`).join("\n"):String(data);
      setResult(result,text);
      result.onclick=()=>copy(text);
      result.title="Tap to copy";
    }catch(e){setResult(result,e.message||"Converter failed.","error");}
  }

  async function resolveLocalAsset(id){
    const data=await window.FortniteAgent.searchDatabase("all",id);
    if(!data?.results?.length)return null;
    const lower=id.toLowerCase();
    const exact=data.results.find(x=>{
      const name=(x.path.split("/").pop()||"").replace(/\.uasset$/i,"").toLowerCase();
      return name===lower;
    });
    return (exact||data.results[0])?.path||null;
  }

  async function exportJson(path){
    if(!path)return null;
    const fsPath=toFilePath(path);
    const url=`${EXPORT_BASE}?path=${encodeURIComponent(fsPath)}&raw=true`;
    const r=await fetch(url);
    if(!r.ok)throw new Error(`Export service returned ${r.status}`);
    const j=await r.json();
    return j?.jsonOutput||[];
  }

  function toFilePath(path){
    let p=String(path||"").trim();
    if(!p)return p;
    if(p.endsWith(".uasset"))return p;
    p=p.split(".")[0];
    if(p.startsWith("/Game/")) return `FortniteGame/Content/${p.slice(6)}.uasset`;
    const parts=p.replace(/^\//,"").split("/");
    if(parts.length>1) return `FortniteGame/Plugins/GameFeatures/${parts[0]}/Content/${parts.slice(1).join("/")}.uasset`;
    return p;
  }
  function objectPath(path){
    if(!path)return null;
    const base=String(path).split(".")[0];
    const name=base.split("/").pop();
    return `${base}.${name}`;
  }
  function walk(node,fn){
    if(Array.isArray(node)){node.forEach(x=>walk(x,fn));return;}
    if(node&&typeof node==="object"){fn(node);Object.values(node).forEach(x=>walk(x,fn));}
  }
  function soundWaves(data){
    const out=[];walk(data,n=>{if(n.ObjectName?.includes("SoundWave")&&n.ObjectPath)out.push(objectPath(n.ObjectPath));});return [...new Set(out)];
  }

  async function emoteToAnimation(id){
    const asset=await resolveLocalAsset(id);if(!asset)return null;
    const data=await exportJson(asset);const p=data?.[0]?.Properties;if(!p)return null;
    return {male:p.Animation?.AssetPathName||"None",female:p.AnimationFemaleOverride?.AssetPathName||"None"};
  }
  async function emoteToSequence(id){
    const anim=await emoteToAnimation(id);if(!anim||anim.male==="None")return null;
    const data=await exportJson(anim.male);
    const raw=data?.[0]?.Properties?.CompositeSections?.[0]?.LinkedSequence?.ObjectPath;
    return raw?objectPath(raw):null;
  }
  async function emoteToAudio(id){
    const asset=await resolveLocalAsset(id);if(!asset)return null;
    const data=await exportJson(asset);
    const anim=data?.[0]?.Properties?.Animation?.AssetPathName;if(!anim)return null;
    const animData=await exportJson(anim);
    const sounds=[];walk(animData,n=>{
      if(n.Type==="FortAnimNotifyState_EmoteSound"){
        const p=n.Properties?.EmoteSound1P?.ObjectPath;if(p)sounds.push(p);
      }
    });
    const out=[];
    for(const p of [...new Set(sounds)]){
      const audio=await exportJson(p);out.push(...soundWaves(audio));
    }
    return [...new Set(out)];
  }
  async function cosmeticApi(input,backendType=""){
    const isId=/^[A-Za-z][A-Za-z0-9_-]+$/.test(input)&&input.includes("_");
    const url=isId
      ?`${FORTNITE_API}/${encodeURIComponent(input)}?responseFlags=7`
      :`${FORTNITE_API}/search?name=${encodeURIComponent(input)}${backendType?`&backendType=${encodeURIComponent(backendType)}`:""}&responseFlags=7`;
    const r=await fetch(url);if(!r.ok)return null;const j=await r.json();return j?.data||null;
  }
  async function auraToVfx(input){
    const api=await cosmeticApi(input);
    let path=api?.path||await resolveLocalAsset(input);if(!path)return null;
    const data=await exportJson(path);const p=data?.[0]?.Properties;if(!p)return null;
    return {main:p.SustainSystem?.AssetPathName||"None",start:p.StartSystem?.AssetPathName||"None",stop:p.StopSystem?.AssetPathName||"None"};
  }
  async function musicToAudio(input){
    const api=await cosmeticApi(input,"AthenaMusicPack");
    let path=api?.path||await resolveLocalAsset(input);if(!path)return null;
    const data=await exportJson(path);
    const music=data?.[0]?.Properties?.FrontEndLobbyMusic?.AssetPathName;if(!music)return null;
    return soundWaves(await exportJson(music));
  }

  function renderPathModifier(){
    content.innerHTML=`
      <div class="tool-section">
        <h2>Path Modifier</h2>
        <textarea id="pathInput" class="tool-textarea" placeholder="FortniteGame/Content/.../Asset.uasset"></textarea>
        <div class="tool-actions">
          <label class="tool-note"><input id="addClass" type="checkbox" /> Add _C</label>
        </div>
        <button id="convertPathBtn" class="tool-button primary" type="button">Convert</button>
        <textarea id="pathOutput" class="tool-textarea" readonly></textarea>
        <div class="tool-actions"><button id="copyPathOutput" class="tool-button" type="button">Copy</button></div>
      </div>`;
    const input=content.querySelector("#pathInput"),output=content.querySelector("#pathOutput");
    content.querySelector("#convertPathBtn").addEventListener("click",()=>output.value=modifyPath(input.value,content.querySelector("#addClass").checked));
    content.querySelector("#copyPathOutput").addEventListener("click",()=>copy(output.value));
  }
  function modifyPath(raw,addClass){
    let path=String(raw||"").trim().replace(/^\.?\//,"");if(!path)return"";
    if(path.startsWith("FortniteGame/Content/")) path="/Game/"+path.slice("FortniteGame/Content/".length);
    else{
      const m=path.match(/(?:FortniteGame\/)?Plugins\/(?:GameFeatures\/)?([^/]+)\/Content\/(.+)/i);
      if(m)path=`/${m[1]}/${m[2]}`;else if(!path.startsWith("/"))path="/"+path;
    }
    path=path.replace(/\.uasset$/i,"");
    const last=path.slice(path.lastIndexOf("/")+1);
    if(last&&!path.includes(`.${last}`))path+=`.${last}`;
    if(addClass&&!path.endsWith("_C"))path+="_C";
    return path;
  }

  async function renderCosmetics(){
    content.innerHTML=`
      <div class="tool-section">
        <h2>Cosmetic Browser</h2>
        <p class="tool-note">Searches your local Fortnite database. Character icons load only for visible cards.</p>
        <div class="tool-searchbar">
          <input id="cosmeticSearch" placeholder="Skin name, CID, character path..." />
          <button id="cosmeticBtn" class="tool-button primary" type="button">Search</button>
        </div>
        <div id="cosmeticStatus" class="tool-empty">Search for a cosmetic.</div>
        <div id="cosmeticGrid" class="cosmetic-grid"></div>
        <div class="tool-actions"><button id="cosmeticMore" class="tool-button" type="button" hidden>Load more</button></div>
      </div>`;
    const input=content.querySelector("#cosmeticSearch");
    const btn=content.querySelector("#cosmeticBtn");
    const more=content.querySelector("#cosmeticMore");
    const run=async()=>{
      const q=input.value.trim();if(!q)return;
      const status=content.querySelector("#cosmeticStatus");status.hidden=false;status.textContent="Searching...";
      const searches=[q];
      if(!q.toLowerCase().includes("character")) searches.push(`${q} Characters`);
      const merged=[];
      for(const s of searches){
        const d=await window.FortniteAgent.searchDatabase("all",s);
        (d?.results||[]).forEach(x=>{if(/cosmetic|character|cid_|outfit/i.test(x.path)&&!merged.some(y=>y.path===x.path))merged.push(x);});
      }
      cosmeticResults=merged;cosmeticShown=0;
      status.textContent=merged.length?`${merged.length} matching paths found.`:"No matching cosmetic paths.";
      renderCosmeticPage();
    };
    btn.addEventListener("click",run);input.addEventListener("keydown",e=>{if(e.key==="Enter")run();});
    more.addEventListener("click",renderCosmeticPage);
  }
  function renderCosmeticPage(){
    const grid=content.querySelector("#cosmeticGrid"),more=content.querySelector("#cosmeticMore");if(!grid||!more)return;
    const slice=cosmeticResults.slice(cosmeticShown,cosmeticShown+COSMETIC_PAGE);cosmeticShown+=slice.length;
    const holder=document.createElement("div");holder.innerHTML=slice.map(cosmeticCard).join("");
    while(holder.firstChild)grid.append(holder.firstChild);
    bindCopyButtons(grid);observeCosmeticImages(grid);
    more.hidden=cosmeticShown>=cosmeticResults.length;
  }
  function cosmeticCard(item){
    const name=(item.path.split("/").pop()||"Cosmetic").replace(/\.uasset$/i,"");
    return `<div class="tool-card cosmetic-card" data-cosmetic-path="${escapeAttr(item.path)}">
      <div class="tool-card-head">
        <img class="tool-card-image cosmetic-img" alt="" loading="lazy" />
        <div style="min-width:0;flex:1">
          <div class="tool-card-title">${escapeHtml(name)}</div>
          <div class="tool-note">Tap COPY for the asset path.</div>
        </div>
      </div>
      ${pathRow("PATH",item.path)}
    </div>`;
  }
  function observeCosmeticImages(root){
    const images=[...root.querySelectorAll(".cosmetic-card:not([data-icon-loaded])")];
    if(!("IntersectionObserver" in window)){images.slice(0,12).forEach(loadCosmeticIcon);return;}
    const io=new IntersectionObserver(entries=>{
      entries.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);loadCosmeticIcon(e.target);}});
    },{root:content,rootMargin:"180px"});
    images.forEach(x=>io.observe(x));
  }
  async function loadCosmeticIcon(card){
    card.dataset.iconLoaded="1";
    try{
      const data=await exportJson(card.dataset.cosmeticPath);
      let icon=null;walk(data,n=>{if(!icon)icon=n.LargeIcon?.AssetPathName||n.Icon?.AssetPathName||null;});
      if(!icon)return;
      const clean=String(icon).split(".")[0];
      const img=card.querySelector(".cosmetic-img");
      img.src=`${EXPORT_BASE}?path=${encodeURIComponent(clean)}&raw=false`;
    }catch{}
  }

  function pathCard(path,source){return `<div class="tool-card"><div class="tool-card-head"><div class="tool-card-title">${source==="json"?"JSON reference":"Asset path"}</div></div>${pathRow(source==="json"?"JSON":"PATH",path)}</div>`;}
  function pathRow(label,value){return `<div class="path-row"><div class="path-label">${escapeHtml(label)}</div><div class="path-value" title="${escapeAttr(value)}">${escapeHtml(value)}</div><button class="path-copy" type="button" data-copy="${escapeAttr(value)}">COPY</button></div>`;}
  function idCard(item){return `<div class="tool-card"><div class="tool-card-head">${item.image?`<img class="tool-card-image" src="${escapeAttr(item.image)}" alt="" loading="lazy" />`:`<div class="tool-card-image"></div>`}<div class="tool-card-title">${escapeHtml(item.name||item.title||"Unknown")}</div></div>${item.playset?pathRow("PLAYSET",item.playset):""}${item.plot?pathRow("PLOT",item.plot):""}${item.path?pathRow("PATH",item.path):""}</div>`;}
  function normalizeDeviceData(data){
    if(!data||typeof data!=="object")return [];

    if(Array.isArray(data)){
      return data.map((value,index)=>{
        if(value&&typeof value==="object"){
          return {name:value.name||value.title||value.device||`Device ${index+1}`,...value};
        }
        return {name:String(value||`Device ${index+1}`)};
      });
    }

    return Object.entries(data).map(([name,value])=>{
      const item=value&&typeof value==="object"?value:{};
      return {name,...item};
    });
  }

  function deviceImageUrl(item){
    const raw=String(item?.image||"").trim();
    if(!raw)return "";

    if(/^https?:\/\//i.test(raw))return raw;

    const filename=raw.replace(/\/g,"/").split("/").pop();
    if(!filename)return "";

    return `https://raw.githubusercontent.com/Th3DryZ69/FortniteToolsWeb/main/public/images/devices/${encodeURIComponent(filename)}`;
  }

  function deviceCard(item){
    const title=item.name||item.title||item.device||item.id||"Device";
    const image=deviceImageUrl(item);
    const badges=[];

    if(item.old===true)badges.push("old");
    if(Array.isArray(item.tag))badges.push(...item.tag.filter(Boolean).slice(0,3));

    return `<div class="tool-card">
      <div class="tool-card-head">
        ${image?`<img class="tool-card-image device-image" src="${escapeAttr(image)}" alt="" loading="lazy" />`:``}
        <div style="min-width:0;flex:1">
          <div class="tool-card-title">${escapeHtml(title)}</div>
          ${badges.length?`<div class="device-badges">${badges.map(b=>`<span class="device-badge">${escapeHtml(b)}</span>`).join("")}</div>`:""}
        </div>
      </div>
      ${item.path?pathRow("PATH",item.path):""}
      ${item.playset?pathRow("PLAYSET",item.playset):""}
    </div>`;
  }

  function bindImageFallbacks(root){
    root.querySelectorAll("img.device-image").forEach(img=>{
      if(img.dataset.fallbackBound)return;
      img.dataset.fallbackBound="1";
      img.addEventListener("error",()=>{
        img.remove();
      },{once:true});
    });
  }

  function walkIdData(value,out,key=""){
    if(!value||typeof value!=="object")return;
    if(!Array.isArray(value)&&("playset"in value||"plot"in value||"path"in value))out.push({name:value.name||value.title||key,...value});
    if(Array.isArray(value))value.forEach((v,i)=>walkIdData(v,out,String(i)));
    else Object.entries(value).forEach(([k,v])=>walkIdData(v,out,k));
  }
    return[];
  }
  function bindCopyButtons(root){root.querySelectorAll("[data-copy]").forEach(b=>{if(b.dataset.bound)return;b.dataset.bound="1";b.addEventListener("click",()=>copy(b.dataset.copy||""));});}
  async function copy(value){
    if(!value)return;
    try{await navigator.clipboard.writeText(value);window.FortniteAgent?.showToast("Copied");}
    catch{
      const ta=document.createElement("textarea");ta.value=value;document.body.append(ta);ta.select();document.execCommand("copy");ta.remove();
    }
  }
  async function fetchJson(url){const r=await fetch(url,{cache:"no-cache"});if(!r.ok)throw new Error(`Couldn't load ${url} (${r.status})`);return r.json();}
  function setResult(el,text,state=""){el.className=`tool-result${state?" "+state:""}`;el.textContent=text;}
  function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
  function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function escapeAttr(v){return escapeHtml(v);}

  window.FortniteTools={open,close};
})();
