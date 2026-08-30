(() => {
  "use strict";

  const overlay=document.getElementById("toolsOverlay");
  const back=document.getElementById("toolsBackBtn");
  const tabs=document.getElementById("toolsTabs");
  const content=document.getElementById("toolsContent");
  const guestBanner=document.getElementById("guestLoginBanner");
  const guestLoginBtn=document.getElementById("guestLoginBtn");
  const DB=window.FORTNITE_AI_DB||{};
  const t=(key,fallback="")=>window.FortniteI18n?.t(key)||fallback||key;

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
  window.addEventListener("fortnite-language-changed",()=>{
    if(!overlay.hidden)render();
  });

  tabs.addEventListener("click",(event)=>{
    const b=event.target.closest(".tools-tab");if(!b)return;
    active=b.dataset.tool;
    [...tabs.querySelectorAll(".tools-tab")].forEach(x=>x.classList.toggle("active",x===b));
    render();
  });

  function open(){
    active="assets";
    [...tabs.querySelectorAll(".tools-tab")].forEach((button)=>{
      button.classList.toggle("active",button.dataset.tool==="assets");
    });

    overlay.hidden=false;
    overlay.setAttribute("aria-hidden","false");
    updateGuestBanner();
    render();
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

  function startSearchingAnimation(element){
    const base=t("searching","Searching");
    const frames=[`${base}.`,`${base}..`,`${base}…`];
    let index=0;

    element.textContent=frames[index];

    const timer=setInterval(()=>{
      index=(index+1)%frames.length;
      element.textContent=frames[index];
    },350);

    return ()=>clearInterval(timer);
  }

  function smartSearchScope(selectedScope,query){
    if(selectedScope!=="all")return selectedScope;

    const q=String(query||"").trim().toLowerCase();

    if(/(^|[\/._-])sm_/.test(q))return "sm";
    if(/(^|[\/._-])(m_|mi_)/.test(q))return "m";

    if(
      /(^|[\/._-])sk_/.test(q) ||
      /\b(mesh|meshes|staticmesh|skeletalmesh)\b/.test(q)
    ){
      return "meshes";
    }

    return "all";
  }

  function renderAssets(){
    content.innerHTML=`
      <div class="tool-section">
        <h2>${escapeHtml(t("manualSearch","Manual Search"))}</h2>
        <p class="tool-note">${escapeHtml(t("manualNote","Search the full local Fortnite files database manually."))}</p>

        <div class="tool-searchbar">
          <input id="assetQuery" placeholder="${escapeAttr(t("searchPlaceholder","Search a path, asset, SM_, M_, MI_..."))}" />
          <button id="assetSearch" class="tool-button primary" type="button">${escapeHtml(t("search","Search"))}</button>
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

    const input=content.querySelector("#assetQuery");
    const results=content.querySelector("#assetResults");

    content.querySelector(".tool-subtabs").addEventListener("click",(e)=>{
      const b=e.target.closest("[data-scope]");
      if(!b)return;

      scope=b.dataset.scope;
      [...content.querySelectorAll(".tool-subtab")]
        .forEach(x=>x.classList.toggle("active",x===b));
    });

    const run=async()=>{
      const q=input.value.trim();
      if(!q)return;

      results.className="tool-empty";
      const stopSearching=startSearchingAnimation(results);

      try{
        const effectiveScope=smartSearchScope(scope,q);
        const data=await window.FortniteAgent.searchDatabase(effectiveScope,q);

        stopSearching();

        if(!data.results?.length){
          results.textContent="No close results found.";
          return;
        }

        results.className="";
        results.innerHTML=data.results
          .slice(0,80)
          .map(x=>pathCard(x.path,x.source))
          .join("");

        bindCopyButtons(results);
        bindJsonButtons(results);
        bindMeshImageButtons(results);
      }catch(e){
        stopSearching();
        results.className="tool-empty";
        results.textContent=e.message||"Search failed.";
      }
    };

    content.querySelector("#assetSearch").addEventListener("click",run);
    input.addEventListener("keydown",e=>{
      if(e.key==="Enter")run();
    });
  }

  async function renderIds(){
    if(!idData)idData=await fetchJson(DB.ids||"./database/id.json");
    if(!deviceData)deviceData=await fetchJson(DB.devices||"./database/devicemeshs.json");

    const islands=[];
    walkIdData(idData,islands);

    const devices=sortDevicesLikeTh3Dry(cleanDeviceList(normalizeDeviceData(deviceData)));
    let showAllDevices=false;

    content.innerHTML=`
      <div class="tool-section ids-combined-section">
        <section class="ids-group">
          <div class="ids-group-head">
            <div>
              <h2>Islands</h2>
              <p class="tool-note">Creative islands, playsets and plot IDs.</p>
            </div>
          </div>

          <div class="tool-searchbar">
            <input
              id="idSearch"
              placeholder="${escapeAttr(t("searchIslands","Search islands / IDs"))}"
            />
          </div>

          <div id="idResults">
            ${islands.slice(0,120).map(idCard).join("")}
          </div>
        </section>

        <div class="ids-section-divider"></div>

        <section class="ids-group device-meshes-group">
          <div class="ids-group-head">
            <div>
              <h2>${escapeHtml(t("deviceMeshes","Device Meshes"))}</h2>
            </div>

            <button id="showAllDevices" class="tool-button device-show-all" type="button">
              👁 Show All
            </button>
          </div>

          <div class="tool-searchbar">
            <input
              id="deviceSearchInIds"
              placeholder="${escapeAttr(t("searchDevice","Search device..."))}"
            />
          </div>

          <div id="deviceResultsInIds"></div>
        </section>
      </div>`;

    const idInput=content.querySelector("#idSearch");
    const idResults=content.querySelector("#idResults");
    const deviceInput=content.querySelector("#deviceSearchInIds");
    const deviceResults=content.querySelector("#deviceResultsInIds");
    const showAllButton=content.querySelector("#showAllDevices");

    const renderIslandResults=()=>{
      const q=idInput.value.trim().toLowerCase();
      const filtered=!q
        ?islands
        :islands.filter(item=>JSON.stringify(item).toLowerCase().includes(q));

      idResults.innerHTML=
        filtered.slice(0,180).map(idCard).join("")||
        '<div class="tool-empty">No results.</div>';

      bindCopyButtons(idResults);
      bindIdImageFallbacks(idResults);
    };

    const renderDeviceResults=()=>{
      const q=deviceInput.value.trim().toLowerCase();

      const filtered=devices.filter(item=>{
        if(!showAllDevices&&item.dispo===false)return false;

        if(!q)return true;

        const hay=[
          item.name,
          cleanDeviceText(item.path),
          cleanDeviceText(item.playset),
          ...(Array.isArray(item.tag)?item.tag:[])
        ].filter(Boolean).join(" ").toLowerCase();

        return hay.includes(q);
      });

      deviceResults.innerHTML=
        filtered.slice(0,220).map(deviceCardSimple).join("")||
        '<div class="tool-empty">No devices found.</div>';

      bindCopyButtons(deviceResults);
      bindImageFallbacks(deviceResults);
    };

    idInput.addEventListener("input",renderIslandResults);
    deviceInput.addEventListener("input",renderDeviceResults);

    showAllButton.addEventListener("click",()=>{
      showAllDevices=!showAllDevices;
      showAllButton.textContent=showAllDevices
        ?"🙈 Hide Unavailable"
        :"👁 Show All";
      renderDeviceResults();
    });

    renderIslandResults();
    renderDeviceResults();
  }

  async function renderDevices(){
    if(!deviceData)deviceData=await fetchJson(DB.devices||"./database/devicemeshs.json");

    const devices=sortDevicesLikeTh3Dry(cleanDeviceList(normalizeDeviceData(deviceData)));
    let showAllDevices=false;

    content.innerHTML=`
      <div class="tool-section">
        <div class="ids-group-head">
          <div>
            <h2>${escapeHtml(t("deviceMeshes","Device Meshes"))}</h2>
            <p class="tool-note">Full device data with settings, keys and values.</p>
          </div>

          <button id="showAllDevicesFull" class="tool-button device-show-all" type="button">
            👁 Show All
          </button>
        </div>

        <div class="tool-searchbar">
          <input
            id="deviceSearch"
            placeholder="${escapeAttr(t("searchDevice","Search device..."))}"
          />
        </div>

        <div id="deviceResults"></div>
      </div>`;

    const input=content.querySelector("#deviceSearch");
    const results=content.querySelector("#deviceResults");
    const showAllButton=content.querySelector("#showAllDevicesFull");

    const renderResults=()=>{
      const q=input.value.trim().toLowerCase();

      const filtered=devices.filter(item=>{
        if(!showAllDevices&&item.dispo===false)return false;

        if(!q)return true;

        const settingsText=Object.entries(item.settings||{})
          .map(([name,data])=>[
            name,
            data?.["option key"],
            data?.value
          ].filter(Boolean).join(" "))
          .join(" ");

        const hay=[
          item.name,
          cleanDeviceText(item.path),
          cleanDeviceText(item.playset),
          ...(Array.isArray(item.tag)?item.tag:[]),
          cleanDeviceText(item.important),
          settingsText
        ].filter(Boolean).join(" ").toLowerCase();

        return hay.includes(q);
      });

      results.innerHTML=
        filtered.slice(0,220).map(deviceCardLikeTh3Dry).join("")||
        '<div class="tool-empty">No devices found.</div>';

      bindCopyButtons(results);
      bindImageFallbacks(results);
    };

    input.addEventListener("input",renderResults);

    showAllButton.addEventListener("click",()=>{
      showAllDevices=!showAllDevices;
      showAllButton.textContent=showAllDevices
        ?"🙈 Hide Unavailable"
        :"👁 Show All";
      renderResults();
    });

    renderResults();
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

  const exportJsonCache=new Map();

  async function exportJson(path){
    if(!path)return null;

    const cacheKey=String(path).trim();
    if(exportJsonCache.has(cacheKey)){
      return exportJsonCache.get(cacheKey);
    }

    const request=(async()=>{
      const fsPath=toFilePath(cacheKey);
      const url=`${EXPORT_BASE}?path=${encodeURIComponent(fsPath)}&raw=true`;
      const r=await fetch(url);
      if(!r.ok)throw new Error(`Export service returned ${r.status}`);
      const j=await r.json();
      return j?.jsonOutput||[];
    })();

    exportJsonCache.set(cacheKey,request);

    try{
      return await request;
    }catch(error){
      exportJsonCache.delete(cacheKey);
      throw error;
    }
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
        <h2>${escapeHtml(t("pathModifier","Path Modifier"))}</h2>
        <p class="tool-note">${escapeHtml(t("pathNote","Convert Fortnite file paths to Unreal object paths."))}</p>

        <textarea
          id="pathInput"
          class="tool-textarea"
          placeholder="FortniteGame/Content/.../Asset.uasset"
        ></textarea>

        <div class="tool-actions">
          <button id="formatPathBtn" class="tool-button primary" type="button">
            ${escapeHtml(t("format","Format"))}
          </button>

          <button id="addClassPathBtn" class="tool-button" type="button">
            ${escapeHtml(t("addClassAction","Add _C"))}
          </button>
        </div>

        <textarea
          id="pathOutput"
          class="tool-textarea"
          readonly
          placeholder="${escapeAttr(t("convertedPath","Converted path will appear here"))}"
        ></textarea>

        <div class="tool-actions">
          <button id="copyPathOutput" class="tool-button" type="button">
            ${escapeHtml(t("copy","Copy"))}
          </button>
        </div>
      </div>`;

    const input=content.querySelector("#pathInput");
    const output=content.querySelector("#pathOutput");

    content.querySelector("#formatPathBtn").addEventListener("click",()=>{
      output.value=modifyPath(input.value,false);
    });

    content.querySelector("#addClassPathBtn").addEventListener("click",()=>{
      output.value=modifyPath(input.value,true);
    });

    content.querySelector("#copyPathOutput").addEventListener("click",()=>{
      copy(output.value);
    });
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
        <h2>${escapeHtml(t("cosmeticBrowser","Cosmetic Browser"))}</h2>
        <p class="tool-note">${escapeHtml(t("cosmeticNote","Search your local Fortnite database for cosmetics."))}</p>
        <a class="tool-external-link"
           href="https://fortnite.gg/cosmetics"
           target="_blank"
           rel="noopener noreferrer">${escapeHtml(t("moreCosmeticIds","For more cosmetics ids"))}</a>
        <div class="tool-searchbar">
          <input id="cosmeticSearch" placeholder="${escapeAttr(t("cosmeticSearch","Skin name, CID, character path..."))}" />
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

  function isLikelyMeshPath(path){
    const value=String(path||"").trim();
    if(!value)return false;

    const clean=value.split(".")[0];
    const name=(clean.split("/").pop()||"").toLowerCase();
    const low=clean.toLowerCase();

    return (
      name.startsWith("sm_") ||
      name.startsWith("sk_") ||
      low.includes("/meshes/") ||
      low.includes("/mesh/") ||
      low.includes("/staticmeshes/") ||
      low.includes("/skeletalmeshes/")
    );
  }

  function pathCard(path,source){
    const label=source==="json"?"JSON":"PATH";
    const title=source==="json"?"JSON reference":"Asset path";
    const canPreview=Boolean(String(path||"").trim());

    return `
      <div class="tool-card">
        <div class="tool-card-head">
          <div class="tool-card-title">${escapeHtml(title)}</div>
        </div>

        ${pathRow(label,path)}

        <div class="json-actions">
          ${canPreview?`
            <button
              class="json-view-button mesh-image-view-button"
              type="button"
              data-image-path="${escapeAttr(path)}"
            >${escapeHtml(t("viewImage","View Image"))}</button>
          `:""}

          <button
            class="json-view-button"
            type="button"
            data-json-path="${escapeAttr(path)}"
          >${escapeHtml(t("viewJson","View JSON"))}</button>
        </div>

        ${canPreview?`
          <div class="mesh-image-panel" hidden>
            <div class="mesh-image-panel-head">
              <span>${escapeHtml(t("imageLabel","IMAGE"))}</span>
            </div>
            <div class="mesh-image-stage">
              <div class="mesh-image-status"></div>
              <img class="mesh-preview-image" alt="" decoding="async" hidden />
            </div>
            <div class="mesh-image-meta" hidden></div>
          </div>
        `:""}

        <div class="json-panel" hidden>
          <div class="json-panel-head">
            <span>JSON</span>
            <button class="json-view-button json-copy-button" type="button">
              ${escapeHtml(t("copyJson","Copy JSON"))}
            </button>
          </div>
          <pre><code></code></pre>
        </div>
      </div>`;
  }
  function pathRow(label,value){return `<div class="path-row"><div class="path-label">${escapeHtml(label)}</div><div class="path-value" title="${escapeAttr(value)}">${escapeHtml(value)}</div><button class="path-copy" type="button" data-copy="${escapeAttr(value)}">COPY</button></div>`;}
  function idImageUrl(item){
    const raw=String(item?.image||"").trim();
    if(!raw)return "";

    if(/^https?:\/\//i.test(raw))return raw;

    let relative=raw.replace(/\\/g,"/");
    relative=relative.replace(/^(\.\.\/)+/,"");
    relative=relative.replace(/^\.?\//,"");
    relative=relative.replace(/^images\//,"");

    if(!relative)return "";

    const encoded=relative
      .split("/")
      .map(part=>encodeURIComponent(part))
      .join("/");

    return `https://raw.githubusercontent.com/Th3DryZ69/FortniteToolsWeb/main/public/images/${encoded}`;
  }

  function bindIdImageFallbacks(root){
    root.querySelectorAll("img.id-image").forEach(img=>{
      if(img.dataset.fallbackBound)return;
      img.dataset.fallbackBound="1";
      img.addEventListener("error",()=>img.remove(),{once:true});
    });
  }

  function idCard(item){
    const image=idImageUrl(item);

    return `<div class="tool-card">
      <div class="tool-card-head">
        ${image
          ?`<img class="tool-card-image id-image" src="${escapeAttr(image)}" alt="" loading="lazy" />`
          :`<div class="tool-card-image"></div>`}
        <div class="tool-card-title">${escapeHtml(item.name||item.title||"Unknown")}</div>
      </div>
      ${item.playset?pathRow("PLAYSET",item.playset):""}
      ${item.plot?pathRow("PLOT",item.plot):""}
      ${item.path?pathRow("PATH",item.path):""}
    </div>`;
  }
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

  function isJunkDeviceText(value){
    const text=String(value||"").trim().toLowerCase();
    if(!text)return false;

    const exactJunk=new Set([
      "~th3dryz69~",
      "th3dryz69",
      "th3dryz69 community",
      "https://discord.gg/xcdvxzumxx",
      "xcdvxzumxx",
      "/"
    ]);

    if(exactJunk.has(text))return true;

    if(text.includes("i haven't put everything but if you have any ideas"))return true;
    if(text.includes("dont hesitate to let me know my discord"))return true;
    if(text.includes("don't hesitate to let me know my discord"))return true;
    if(text.includes("my discord: th3dryz69_"))return true;
    if(text.includes("discord.gg/xcdvxzumxx"))return true;

    return false;
  }

  function cleanDeviceText(value){
    return isJunkDeviceText(value)?"":String(value||"");
  }

  function isJunkDevice(item){
    if(!item||typeof item!=="object")return false;

    if(isJunkDeviceText(item.name))return true;

    const fields=[
      item.path,
      item.playset,
      item.important
    ];

    const meaningful=fields.some(v=>String(v||"").trim()&&!isJunkDeviceText(v));
    const junk=fields.some(isJunkDeviceText);

    // Remove fake/credit/footer records that are only made from junk strings.
    if(junk&&!meaningful)return true;

    return false;
  }

  function cleanDeviceList(list){
    return list.filter(item=>!isJunkDevice(item));
  }

  function sortDevicesLikeTh3Dry(list){
    return [...list].sort((a,b)=>{
      const aName=String(a?.name||"");
      const bName=String(b?.name||"");

      const aLatin=/^[a-zA-Z]/.test(aName);
      const bLatin=/^[a-zA-Z]/.test(bName);

      if(aLatin&&!bLatin)return -1;
      if(!aLatin&&bLatin)return 1;

      return aName.localeCompare(bName,undefined,{sensitivity:"base"});
    });
  }

  function shortPlayset(value){
    const raw=String(value||"");
    if(!raw)return "";
    return raw.split(".").pop()||raw;
  }

  function deviceSettingsRows(settings){
    const entries=Object.entries(settings||{})
      .map(([settingName,settingData])=>({
        settingName,
        settingData:settingData&&typeof settingData==="object"?settingData:{}
      }))
      .filter(({settingName,settingData})=>{
        const key=settingData?.["option key"];
        const value=settingData?.value;

        // Remove Th3Dry credits/footer/community rows.
        if(isJunkDeviceText(settingName))return false;
        if(isJunkDeviceText(key))return false;
        if(isJunkDeviceText(value))return false;

        return true;
      });

    if(!entries.length)return "";

    return `
      <div class="device-settings-table">
        ${entries.map(({settingName,settingData})=>{
          const key=cleanDeviceText(settingData?.["option key"]);
          const value=cleanDeviceText(settingData?.value);

          return `
            <div class="device-setting-row">
              <div class="device-setting-name" title="${escapeAttr(settingName)}">
                ${escapeHtml(settingName)}
              </div>

              <div class="device-setting-fields">
                <div class="device-setting-field">
                  <span class="device-field-tag">Key</span>
                  <span class="device-field-value" title="${escapeAttr(key)}">${escapeHtml(key)}</span>
                  ${key?`<button class="path-copy" type="button" data-copy="${escapeAttr(key)}">COPY</button>`:""}
                </div>

                <div class="device-setting-field">
                  <span class="device-field-tag">Val</span>
                  <span class="device-field-value" title="${escapeAttr(value)}">${escapeHtml(value)}</span>
                  ${value?`<button class="path-copy" type="button" data-copy="${escapeAttr(value)}">COPY</button>`:""}
                </div>
              </div>
            </div>`;
        }).join("")}
      </div>`;
  }

  function deviceCardSimple(item){
    const title=item.name||item.title||item.device||item.id||"Device";
    const image=deviceImageUrl(item);
    const playset=cleanDeviceText(item.playset);
    const path=cleanDeviceText(item.path);

    return `
      <div class="tool-card th3-device-card">
        <div class="tool-card-head th3-device-head">
          ${image
            ?`<img class="tool-card-image device-image" src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" />`
            :`<div class="tool-card-image device-image-placeholder">📦</div>`}

          <div class="th3-device-header-text">
            <div class="tool-card-title" title="${escapeAttr(title)}">${escapeHtml(title)}</div>

            ${playset?`
              <div class="device-playset-short">
                <span class="device-playset-value" title="${escapeAttr(playset)}">
                  ${escapeHtml(shortPlayset(playset))}
                </span>
                <button class="path-copy" type="button" data-copy="${escapeAttr(playset)}">COPY</button>
              </div>`:""}
          </div>
        </div>

        ${path?pathRow("PATH",path):""}
      </div>`;
  }

  function deviceCardLikeTh3Dry(item){
    const title=item.name||item.title||item.device||item.id||"Device";
    const image=deviceImageUrl(item);
    const playset=cleanDeviceText(item.playset);
    const path=cleanDeviceText(item.path);
    const important=cleanDeviceText(item.important).trim();

    return `
      <div class="tool-card th3-device-card">
        <div class="tool-card-head th3-device-head">
          ${image
            ?`<img class="tool-card-image device-image" src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy" />`
            :`<div class="tool-card-image device-image-placeholder">📦</div>`}

          <div class="th3-device-header-text">
            <div class="tool-card-title" title="${escapeAttr(title)}">${escapeHtml(title)}</div>

            ${playset?`
              <div class="device-playset-short">
                <span class="device-playset-value" title="${escapeAttr(playset)}">
                  ${escapeHtml(shortPlayset(playset))}
                </span>
                <button class="path-copy" type="button" data-copy="${escapeAttr(playset)}">COPY</button>
              </div>`:""}
          </div>
        </div>

        ${important?`
          <div class="device-important">
            ⚠️ ${escapeHtml(important)}
          </div>`:""}

        ${path?pathRow("PATH",path):""}

        ${deviceSettingsRows(item.settings)}
      </div>`;
  }

  function deviceImageUrl(item){
    const raw=String(item?.image||"").trim();
    if(!raw)return "";

    if(/^https?:\/\//i.test(raw))return raw;

    const filename=raw.replace(/\\/g,"/").split("/").pop();
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
  /* ===== FNAA Epic Image Resolver =====
     Resolution order:
     1) confirmed local cache
     2) requested path if it is already an image-like asset
     3) direct Epic thumbnail/icon/preview reference from exported JSON
     4) strict sibling image candidate from the local Fortnite path database
     5) reverse lookup: related Gallery/Prefab/Playset/Creative asset whose JSON
        actually references the requested asset, then use its Epic image
     6) No Image found / Error 404

     This intentionally does NOT render StaticMesh/SkeletalMesh geometry.
  */
  const IMAGE_RESOLVER_CACHE_KEY="fortniteAiAgent.imageResolver.v2";
  const imageResolverJsonCache=new Map();
  const imageResolverProbeCache=new Map();
  const IMAGE_RELATED_LIMIT=32;
  const IMAGE_RELATED_CONCURRENCY=4;

  function normalizeAssetReference(value){
    let text=String(value||"").trim();
    if(!text)return "";

    const quoted=text.match(/(?:Texture2D|Texture|Object|StaticMesh|SkeletalMesh|Blueprint)?'?((?:\/|FortniteGame\/)[^'\"]+)'?/i);
    if(quoted?.[1])text=quoted[1];

    text=text.replace(/^['\"]|['\"]$/g,"");
    text=text.replace(/\.uasset$/i,"");

    if(!/^(?:\/|FortniteGame\/)/i.test(text))return "";
    return text;
  }

  function imageReferenceFromValue(value){
    if(typeof value==="string")return normalizeAssetReference(value);
    if(!value||typeof value!=="object")return "";

    for(const key of [
      "AssetPathName","ObjectPath","Path","ResourceObject","AssetPath",
      "SoftObjectPath","ObjectPathName","PackageName"
    ]){
      const found=normalizeAssetReference(value[key]);
      if(found)return found;
    }

    return "";
  }

  function imageRefsFromValue(value){
    const out=[];
    const seen=new Set();

    const add=(v)=>{
      const ref=normalizeAssetReference(v);
      if(!ref)return;
      const low=ref.toLowerCase();
      if(seen.has(low))return;
      seen.add(low);
      out.push(ref);
    };

    if(typeof value==="string"){
      add(value);
      return out;
    }

    if(value&&typeof value==="object"){
      for(const key of [
        "AssetPathName","ObjectPath","Path","ResourceObject","AssetPath",
        "SoftObjectPath","ObjectPathName","PackageName"
      ]){
        if(typeof value[key]==="string")add(value[key]);
      }
    }

    return out;
  }

  function imageAssetName(path){
    return String(path||"").split("/").pop()||"";
  }

  function imageSemanticTokens(path){
    let name=imageAssetName(path).toLowerCase().split(".")[0];
    name=name.replace(/^(?:sm_|sk_|pid_|pb_|mi_|m_|bp_|t[-_]?icon[-_]?)/i,"");

    const stop=new Set([
      "athena","creative","prop","props","mesh","meshes","static","staticmesh",
      "skeletalmesh","asset","game","content","cp","br","gallery","prefab",
      "playset","device","icon","thumbnail","preview","image","01","02","03","04",
      "05","06","07","08","09","a","b","c"
    ]);

    return [...new Set(
      name.split(/[_\-.\s]+/)
        .map(x=>x.trim())
        .filter(x=>x.length>=3&&!stop.has(x)&&!/^\d+$/.test(x))
    )].slice(0,7);
  }

  function imageTokenOverlap(a,b){
    const aa=new Set(imageSemanticTokens(a));
    const bb=new Set(imageSemanticTokens(b));
    let count=0;
    for(const token of aa)if(bb.has(token))count++;
    return count;
  }

  function isImageLikeAssetPath(path){
    const low=imageAssetName(path).toLowerCase();
    return /(?:t[-_]?icon|thumbnail|preview|display.?image|gallery.?art|prefab.?icon|featured.?image|ui[-_]?icon|portrait|keyart)/i.test(low);
  }

  function isLikelySurfaceTexture(path){
    const low=imageAssetName(path).toLowerCase();
    if(/(?:icon|thumbnail|preview|display|gallery|prefab|portrait|keyart)/i.test(low))return false;

    return /(?:^|[_-])(?:n|normal|d|diff|diffuse|albedo|basecolor|s|spec|specular|r|rough|roughness|m|metal|metallic|orm|mra|mask|opacity|ao)(?:$|[_-])/i.test(low);
  }

  function rankImageCandidates(data,contextPath=""){
    const found=new Map();
    const keyPattern=/(?:displayassetpath|displayasset|galleryart|galleryimage|prefabicon|largeicon|smallicon|icon|previewimage|smallpreviewimage|largepreviewimage|thumbnailimage|thumbnailtexture|previewtexture|displayimage|featuredimage|portrait|keyart|image|brush)/i;
    const namePattern=/(?:t[-_]?icon|thumbnail|preview|display.?image|gallery.?art|prefab.?icon|featured.?image|ui[-_]?icon|portrait|keyart)/i;

    const add=(value,key="",bonus=0)=>{
      for(const ref of imageRefsFromValue(value)){
        if(isLikelySurfaceTexture(ref))continue;
        let score=bonus;
        if(keyPattern.test(key))score+=120;
        if(namePattern.test(ref))score+=150;
        if(/Texture2D/i.test(String(value)))score+=25;
        score+=imageTokenOverlap(ref,contextPath)*18;

        const low=ref.toLowerCase();
        const old=found.get(low);
        if(!old||old.score<score)found.set(low,{ref,score});
      }
    };

    const scan=(node,parentKey="")=>{
      if(node==null)return;

      if(typeof node==="string"){
        if(keyPattern.test(parentKey)||namePattern.test(node)){
          add(node,parentKey,keyPattern.test(parentKey)?80:0);
        }
        return;
      }

      if(Array.isArray(node)){
        node.forEach(x=>scan(x,parentKey));
        return;
      }

      if(typeof node==="object"){
        for(const [key,value] of Object.entries(node)){
          if(keyPattern.test(key))add(value,key,100);
          scan(value,key);
        }
      }
    };

    scan(data);
    return [...found.values()]
      .sort((a,b)=>b.score-a.score)
      .map(x=>x.ref)
      .slice(0,18);
  }

  // Keep the old function name because older FNAA code may still call it.
  function explicitPreviewCandidates(data){
    return rankImageCandidates(data,"");
  }

  function previewImageUrls(assetRef){
    const ref=normalizeAssetReference(assetRef);
    if(!ref)return [];

    const clean=ref.includes(".")?ref.split(".")[0]:ref;
    const urls=[`${EXPORT_BASE}?path=${encodeURIComponent(clean)}&raw=false`];

    const fsPath=toFilePath(clean);
    if(fsPath&&fsPath!==clean){
      urls.push(`${EXPORT_BASE}?path=${encodeURIComponent(fsPath)}&raw=false`);
    }

    return [...new Set(urls)];
  }

  function loadImageUrl(img,url,timeoutMs=12000){
    return new Promise((resolve)=>{
      let done=false;
      const finish=(ok)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        img.onload=null;
        img.onerror=null;
        resolve(ok);
      };

      const timer=setTimeout(()=>finish(false),timeoutMs);
      img.onload=()=>finish(img.naturalWidth>0&&img.naturalHeight>0);
      img.onerror=()=>finish(false);
      img.src=url;
    });
  }

  function probeImageUrl(url,timeoutMs=10000){
    if(imageResolverProbeCache.has(url))return imageResolverProbeCache.get(url);

    const request=new Promise((resolve)=>{
      const probe=new Image();
      let done=false;

      const finish=(ok)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        probe.onload=null;
        probe.onerror=null;
        resolve(ok);
      };

      const timer=setTimeout(()=>finish(false),timeoutMs);
      probe.onload=()=>finish(probe.naturalWidth>0&&probe.naturalHeight>0);
      probe.onerror=()=>finish(false);
      probe.src=url;
    });

    imageResolverProbeCache.set(url,request);
    request.then(ok=>{if(!ok)imageResolverProbeCache.delete(url);});
    return request;
  }

  async function firstWorkingPreviewUrl(assetRef){
    for(const url of previewImageUrls(assetRef)){
      if(await probeImageUrl(url))return url;
    }
    return "";
  }

  function readImageResolverCache(){
    try{
      const value=JSON.parse(localStorage.getItem(IMAGE_RESOLVER_CACHE_KEY)||"{}");
      return value&&typeof value==="object"?value:{};
    }catch{
      return {};
    }
  }

  function rememberImageResolution(path,result){
    if(!path||!result?.url)return;

    try{
      const cache=readImageResolverCache();
      cache[String(path).toLowerCase()]={
        url:result.url,
        assetRef:result.assetRef||"",
        source:result.source||"Epic image",
        savedAt:Date.now()
      };

      const trimmed=Object.fromEntries(
        Object.entries(cache)
          .sort((a,b)=>(b[1]?.savedAt||0)-(a[1]?.savedAt||0))
          .slice(0,300)
      );

      localStorage.setItem(IMAGE_RESOLVER_CACHE_KEY,JSON.stringify(trimmed));
    }catch{}
  }

  async function cachedImageResolution(path){
    const item=readImageResolverCache()[String(path||"").toLowerCase()];
    if(!item?.url)return null;
    if(!await probeImageUrl(item.url))return null;
    return item;
  }

  async function imageResolverExportJson(path){
    const key=String(path||"").trim();
    if(!key)return null;
    if(imageResolverJsonCache.has(key))return imageResolverJsonCache.get(key);

    const request=exportJson(key);
    imageResolverJsonCache.set(key,request);

    try{
      return await request;
    }catch(error){
      imageResolverJsonCache.delete(key);
      throw error;
    }
  }

  function isCreativeImageContainerPath(path){
    const low=String(path||"").toLowerCase();
    return /(?:playset|prefab|galler|gallery|creative|pid_|pb_|device|plot)/i.test(low);
  }

  function targetImageNeedles(path){
    const ref=(normalizeAssetReference(path)||String(path||"")).toLowerCase();
    const clean=ref.split(".")[0];
    const base=imageAssetName(clean).toLowerCase();
    const noPrefix=base.replace(/^(?:sm_|sk_|pid_|pb_|mi_|m_|bp_)/i,"");

    return [...new Set([clean,base,noPrefix].filter(x=>x&&x.length>=5))];
  }

  function exportedJsonReferencesTarget(data,targetPath){
    if(!data)return false;
    let text="";
    try{text=JSON.stringify(data).toLowerCase();}catch{return false;}
    return targetImageNeedles(targetPath).some(needle=>text.includes(needle));
  }

  async function collectImageRelatedSearchResults(targetPath){
    if(!window.FortniteAgent?.searchDatabase)return [];

    const tokens=imageSemanticTokens(targetPath);
    const base=imageAssetName(targetPath)
      .replace(/\.(?:uasset|uexp|ubulk)$/i,"")
      .replace(/^(?:sm_|sk_|pid_|pb_|mi_|m_|bp_)/i,"");

    const queries=[base,tokens.join(" ")];
    for(const token of tokens.slice(0,4)){
      queries.push(`${token} gallery`,`${token} prefab`,`${token} playset`);
    }

    const uniqueQueries=[...new Set(queries.map(x=>String(x||"").trim()).filter(x=>x.length>=3))].slice(0,10);
    const responses=await Promise.all(uniqueQueries.map(async query=>{
      try{return await window.FortniteAgent.searchDatabase("all",query);}
      catch{return null;}
    }));

    const map=new Map();
    for(const response of responses){
      const list=response?.allResults||response?.results||[];
      for(const item of list){
        const path=String(item?.path||"").trim();
        if(!path)continue;
        const low=path.toLowerCase();
        if(low===String(targetPath||"").toLowerCase())continue;

        let score=imageTokenOverlap(path,targetPath)*80;
        if(isCreativeImageContainerPath(path))score+=260;
        if(isImageLikeAssetPath(path))score+=180;
        if(/(?:playset|prefab|galler|gallery|pid_|pb_)/i.test(low))score+=120;

        const old=map.get(low);
        if(!old||old.score<score)map.set(low,{path,score});
      }
    }

    return [...map.values()]
      .sort((a,b)=>b.score-a.score||a.path.length-b.path.length)
      .slice(0,100);
  }

  async function resolveStrictSiblingImage(targetPath,related){
    const targetTokens=imageSemanticTokens(targetPath);
    if(!targetTokens.length)return null;

    const targetDir=String(targetPath||"").split(".")[0].toLowerCase().split("/").slice(0,-1).join("/");

    for(const item of related){
      if(!isImageLikeAssetPath(item.path))continue;

      const overlap=imageTokenOverlap(item.path,targetPath);
      const candidateDir=String(item.path||"").split(".")[0].toLowerCase().split("/").slice(0,-1).join("/");
      const sameDir=targetDir&&candidateDir===targetDir;

      // One-token names are too ambiguous unless the image is in the same folder.
      if(targetTokens.length===1){
        if(!(sameDir&&overlap>=1))continue;
      }else if(overlap<2){
        continue;
      }

      const url=await firstWorkingPreviewUrl(item.path);
      if(url){
        return {
          url,
          assetRef:item.path,
          source:"Epic sibling image"
        };
      }
    }

    return null;
  }

  async function mapImageResolverLimit(items,limit,fn){
    const out=new Array(items.length);
    let next=0;

    const worker=async()=>{
      while(true){
        const index=next++;
        if(index>=items.length)return;
        out[index]=await fn(items[index],index);
      }
    };

    await Promise.all(
      Array.from({length:Math.min(limit,items.length)},()=>worker())
    );

    return out;
  }

  async function resolveRelatedCreativeImage(targetPath,related){
    const candidates=related
      .filter(item=>isCreativeImageContainerPath(item.path)&&!isImageLikeAssetPath(item.path))
      .slice(0,IMAGE_RELATED_LIMIT);

    const checked=await mapImageResolverLimit(
      candidates,
      IMAGE_RELATED_CONCURRENCY,
      async item=>{
        try{
          const data=await imageResolverExportJson(item.path);
          if(!exportedJsonReferencesTarget(data,targetPath))return null;

          for(const ref of rankImageCandidates(data,item.path)){
            const url=await firstWorkingPreviewUrl(ref);
            if(url){
              return {
                url,
                assetRef:ref,
                source:`Related Epic image via ${imageAssetName(item.path)}`
              };
            }
          }
        }catch{}
        return null;
      }
    );

    return checked.find(Boolean)||null;
  }

  async function resolveFortniteImage(path){
    const requested=normalizeAssetReference(path)||String(path||"").trim();
    if(!requested)return null;

    // 1. Confirmed browser cache.
    const cached=await cachedImageResolution(requested);
    if(cached)return cached;

    // 2. The requested asset is itself an Epic image-like Texture2D path.
    if(isImageLikeAssetPath(requested)){
      const url=await firstWorkingPreviewUrl(requested);
      if(url){
        const result={url,assetRef:requested,source:"Direct Epic image"};
        rememberImageResolution(requested,result);
        return result;
      }
    }

    // 3. Direct exported JSON references.
    try{
      const data=await imageResolverExportJson(requested);
      for(const ref of rankImageCandidates(data,requested)){
        const url=await firstWorkingPreviewUrl(ref);
        if(url){
          const result={url,assetRef:ref,source:"Epic thumbnail/icon"};
          rememberImageResolution(requested,result);
          return result;
        }
      }
    }catch{}

    // 4/5. Local DB name discovery, then strict checks to avoid random images.
    const related=await collectImageRelatedSearchResults(requested);

    const sibling=await resolveStrictSiblingImage(requested,related);
    if(sibling){
      rememberImageResolution(requested,sibling);
      return sibling;
    }

    const creative=await resolveRelatedCreativeImage(requested,related);
    if(creative){
      rememberImageResolution(requested,creative);
      return creative;
    }

    return null;
  }

  function closeMeshImagePanel(card){
    const panel=card?.querySelector(".mesh-image-panel");
    const button=card?.querySelector("[data-image-path]");
    if(!panel||panel.hidden)return;

    panel.hidden=true;
    if(button)button.textContent=t("viewImage","View Image");
  }

  function closeJsonPanel(card){
    const panel=card?.querySelector(".json-panel");
    const button=card?.querySelector("[data-json-path]");
    if(!panel||panel.hidden)return;

    panel.hidden=true;
    if(button)button.textContent=t("viewJson","View JSON");
  }

  function bindMeshImageButtons(root){
    root.querySelectorAll("[data-image-path]").forEach((button)=>{
      if(button.dataset.imageBound)return;
      button.dataset.imageBound="1";

      button.addEventListener("click",async()=>{
        const card=button.closest(".tool-card");
        const panel=card?.querySelector(".mesh-image-panel");
        const status=panel?.querySelector(".mesh-image-status");
        const meta=panel?.querySelector(".mesh-image-meta");
        const img=panel?.querySelector(".mesh-preview-image");

        if(!card||!panel||!status||!img)return;

        if(!panel.hidden){
          closeMeshImagePanel(card);
          return;
        }

        closeJsonPanel(card);
        panel.hidden=false;
        button.textContent=t("hideImage","Hide Image");

        if(button.dataset.imageState==="ready"&&img.src){
          status.hidden=true;
          if(meta)meta.hidden=false;
          img.hidden=false;
          return;
        }

        button.disabled=true;
        img.hidden=true;
        status.hidden=false;
        if(meta){meta.hidden=true;meta.textContent="";}
        status.textContent=t("loadingImage","Searching Epic images...");

        try{
          const result=await resolveFortniteImage(button.dataset.imagePath);

          if(!result?.url){
            button.dataset.imageState="missing";
            img.removeAttribute("src");
            img.hidden=true;
            status.hidden=false;
            status.textContent=t("imageUnavailable","No Image found\nError 404");
            return;
          }

          if(!await loadImageUrl(img,result.url)){
            throw new Error("Resolved image could not be loaded.");
          }

          button.dataset.imageState="ready";
          status.hidden=true;
          img.hidden=false;

          if(meta){
            meta.textContent=result.source||"Epic image";
            meta.hidden=false;
          }
        }catch(error){
          // Temporary failures are intentionally NOT cached as 404.
          button.dataset.imageState="";
          img.removeAttribute("src");
          img.hidden=true;
          status.hidden=false;
          status.textContent=t("imageError","Preview temporarily unavailable.");
          if(meta){meta.hidden=true;meta.textContent="";}
          console.warn("FNAA Image Resolver:",error);
        }finally{
          button.disabled=false;
          if(!panel.hidden)button.textContent=t("hideImage","Hide Image");
        }
      });
    });
  }

  function bindJsonButtons(root){
    root.querySelectorAll("[data-json-path]").forEach((button)=>{
      if(button.dataset.jsonBound)return;
      button.dataset.jsonBound="1";

      button.addEventListener("click",async()=>{
        const card=button.closest(".tool-card");
        const panel=card?.querySelector(".json-panel");
        const code=panel?.querySelector("code");
        const copyButton=panel?.querySelector(".json-copy-button");

        if(!panel||!code)return;

        if(!panel.hidden){
          panel.hidden=true;
          button.textContent=t("viewJson","View JSON");
          return;
        }

        closeMeshImagePanel(card);

        if(button.dataset.loaded==="1"){
          panel.hidden=false;
          button.textContent=t("hideJson","Hide JSON");
          return;
        }

        button.disabled=true;
        button.textContent="Loading...";

        try{
          const data=await exportJson(button.dataset.jsonPath);
          const pretty=JSON.stringify(data,null,2);

          code.textContent=pretty||"[]";
          panel.hidden=false;
          button.dataset.loaded="1";
          button.textContent=t("hideJson","Hide JSON");

          if(copyButton){
            copyButton.onclick=()=>copy(pretty);
          }
        }catch(error){
          code.textContent=error?.message||t("jsonUnavailable","JSON is unavailable for this path.");
          panel.hidden=false;
          button.textContent=t("viewJson","View JSON");
        }finally{
          button.disabled=false;
        }
      });
    });
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
