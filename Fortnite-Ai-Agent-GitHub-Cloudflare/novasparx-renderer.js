(() => {
  "use strict";

  const DEFAULT_BG = [0, 0, 0, 0];

  function typed(raw, Type = Float32Array) {
    return raw instanceof Type ? raw : new Type(raw);
  }

  function calculateNormals(positions, indices) {
    const normals = new Float32Array(positions.length);

    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;

      const ax = positions[ia], ay = positions[ia + 1], az = positions[ia + 2];
      const bx = positions[ib], by = positions[ib + 1], bz = positions[ib + 2];
      const cx = positions[ic], cy = positions[ic + 1], cz = positions[ic + 2];

      const abx = bx - ax, aby = by - ay, abz = bz - az;
      const acx = cx - ax, acy = cy - ay, acz = cz - az;

      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;

      for (const o of [ia, ib, ic]) {
        normals[o] += nx;
        normals[o + 1] += ny;
        normals[o + 2] += nz;
      }
    }

    for (let i = 0; i < normals.length; i += 3) {
      const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    }
    return normals;
  }

  function boundsOf(p) {
    let minX=Infinity,minY=Infinity,minZ=Infinity;
    let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;

    for (let i=0;i<p.length;i+=3) {
      const x=p[i],y=p[i+1],z=p[i+2];
      if(x<minX)minX=x;if(x>maxX)maxX=x;
      if(y<minY)minY=y;if(y>maxY)maxY=y;
      if(z<minZ)minZ=z;if(z>maxZ)maxZ=z;
    }

    const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
    const sx=Math.max(1e-6,maxX-minX);
    const sy=Math.max(1e-6,maxY-minY);
    const sz=Math.max(1e-6,maxZ-minZ);
    const radius=Math.max(1e-6,Math.hypot(sx,sy,sz)/2);

    return {minX,minY,minZ,maxX,maxY,maxZ,cx,cy,cz,sx,sy,sz,radius};
  }

  function mat4Identity() {
    return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  }

  function mat4Multiply(a,b) {
    const o=new Float32Array(16);
    for(let c=0;c<4;c++)for(let r=0;r<4;r++){
      o[c*4+r]=
        a[r]*b[c*4]+
        a[4+r]*b[c*4+1]+
        a[8+r]*b[c*4+2]+
        a[12+r]*b[c*4+3];
    }
    return o;
  }

  function mat4Translation(x,y,z) {
    const m=mat4Identity();
    m[12]=x;m[13]=y;m[14]=z;
    return m;
  }

  function mat4Scale(s) {
    const m=mat4Identity();
    m[0]=m[5]=m[10]=s;
    return m;
  }

  function lookAt(eye,center,up) {
    let zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];
    let len=Math.hypot(zx,zy,zz)||1;zx/=len;zy/=len;zz/=len;

    let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;
    len=Math.hypot(xx,xy,xz)||1;xx/=len;xy/=len;xz/=len;

    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;

    return new Float32Array([
      xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,
      -(xx*eye[0]+xy*eye[1]+xz*eye[2]),
      -(yx*eye[0]+yy*eye[1]+yz*eye[2]),
      -(zx*eye[0]+zy*eye[1]+zz*eye[2]),1
    ]);
  }

  function ortho(l,r,b,t,n,f) {
    const lr=1/(l-r),bt=1/(b-t),nf=1/(n-f);
    return new Float32Array([
      -2*lr,0,0,0,
      0,-2*bt,0,0,
      0,0,2*nf,0,
      (l+r)*lr,(t+b)*bt,(f+n)*nf,1
    ]);
  }

  function chooseCamera(bounds) {
    const horizontal = Math.max(bounds.sx, bounds.sy);
    const flatness = bounds.sz / horizontal;
    const tallness = bounds.sz / Math.max(Math.min(bounds.sx,bounds.sy),1e-6);

    if (flatness < 0.13) return [2.25,-2.25,4.20];
    if (tallness > 4.5) return [3.15,-3.15,2.15];
    if (bounds.sx / bounds.sy > 4 || bounds.sy / bounds.sx > 4) return [2.75,-2.75,2.85];
    return [2.85,-2.85,2.65];
  }

  function compile(gl,type,src) {
    const s=gl.createShader(type);
    gl.shaderSource(s,src);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
      const e=gl.getShaderInfoLog(s)||"Shader compile failed";
      gl.deleteShader(s);throw new Error(e);
    }
    return s;
  }

  function program(gl) {
    const vs=compile(gl,gl.VERTEX_SHADER,`
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUV;
      attribute vec4 aColor;
      attribute vec4 aTangent;

      uniform mat4 uMVP;
      uniform mat4 uModel;
      uniform vec2 uUVScale;
      uniform vec2 uUVOffset;

      varying vec3 vNormal;
      varying vec3 vTangent;
      varying float vTangentSign;
      varying vec2 vUV;
      varying vec4 vColor;

      void main(){
        gl_Position=uMVP*vec4(aPosition,1.0);
        vNormal=normalize(mat3(uModel)*aNormal);
        vTangent=normalize(mat3(uModel)*aTangent.xyz);
        vTangentSign=aTangent.w;
        vUV=aUV*uUVScale+uUVOffset;
        vColor=aColor;
      }
    `);

    const fs=compile(gl,gl.FRAGMENT_SHADER,`
      precision highp float;

      varying vec3 vNormal;
      varying vec3 vTangent;
      varying float vTangentSign;
      varying vec2 vUV;
      varying vec4 vColor;

      uniform vec4 uBaseColor;
      uniform float uRoughness;
      uniform float uMetallic;
      uniform float uOpacity;
      uniform float uOpacityCutoff;
      uniform int uAlphaMode;

      uniform sampler2D uBaseMap;
      uniform sampler2D uNormalMap;
      uniform sampler2D uEmissiveMap;
      uniform sampler2D uOpacityMap;

      uniform bool uHasBaseMap;
      uniform bool uHasNormalMap;
      uniform bool uHasEmissiveMap;
      uniform bool uHasOpacityMap;
      uniform bool uUseVertexColor;

      vec3 srgbToLinear(vec3 c){return pow(max(c,vec3(0.0)),vec3(2.2));}
      vec3 linearToSrgb(vec3 c){return pow(max(c,vec3(0.0)),vec3(1.0/2.2));}

      void main(){
        vec4 base=uBaseColor;

        if(uHasBaseMap){
          vec4 tex=texture2D(uBaseMap,vUV);
          base.rgb*=srgbToLinear(tex.rgb);
          base.a*=tex.a;
        }else{
          base.rgb=srgbToLinear(base.rgb);
        }

        if(uUseVertexColor){
          base.rgb*=srgbToLinear(vColor.rgb);
          base.a*=vColor.a;
        }

        float alpha=base.a*uOpacity;
        if(uHasOpacityMap) alpha*=texture2D(uOpacityMap,vUV).r;

        if(uAlphaMode==1 && alpha<uOpacityCutoff) discard;
        if(alpha<=0.003) discard;

        vec3 n=normalize(vNormal);
        if(uHasNormalMap){
          vec3 t=normalize(vTangent);
          vec3 b=normalize(cross(n,t))*vTangentSign;
          mat3 tbn=mat3(t,b,n);
          vec3 mapN=texture2D(uNormalMap,vUV).xyz*2.0-1.0;
          n=normalize(tbn*mapN);
        }

        vec3 key=normalize(vec3(0.45,-0.55,0.75));
        vec3 fill=normalize(vec3(-0.70,0.25,0.55));
        vec3 viewDir=normalize(vec3(0.45,-0.45,0.75));

        float ndl=max(dot(n,key),0.0);
        float fillL=max(dot(n,fill),0.0);
        float hemi=0.30+0.18*(n.z*0.5+0.5);

        vec3 halfDir=normalize(key+viewDir);
        float specPower=mix(80.0,8.0,uRoughness);
        float spec=pow(max(dot(n,halfDir),0.0),specPower);
        vec3 specColor=mix(vec3(0.04),base.rgb,uMetallic);

        vec3 color=base.rgb*(hemi+ndl*0.62+fillL*0.18);
        color+=specColor*spec*mix(0.22,0.72,1.0-uRoughness);

        if(uHasEmissiveMap){
          color+=srgbToLinear(texture2D(uEmissiveMap,vUV).rgb);
        }

        gl_FragColor=vec4(linearToSrgb(color),alpha);
      }
    `);

    const p=gl.createProgram();
    gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
      const e=gl.getProgramInfoLog(p)||"Shader link failed";gl.deleteProgram(p);throw new Error(e);
    }
    return p;
  }

  function solidTexture(gl, rgba=[255,255,255,255]) {
    const tex=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(rgba));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
    return tex;
  }

  async function imageTexture(gl,url, fallback) {
    if(!url)return {texture:fallback,loaded:false};

    try{
      const r=await fetch(url,{mode:"cors",cache:"force-cache"});
      if(!r.ok)throw new Error(String(r.status));
      const blob=await r.blob();
      const bitmap=await createImageBitmap(blob,{premultiplyAlpha:"none",colorSpaceConversion:"default"});
      const tex=gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D,tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D);
      bitmap.close?.();
      return {texture:tex,loaded:true};
    }catch{
      return {texture:fallback,loaded:false};
    }
  }

  function bindAttribute(gl,p,name,buffer,size,defaultValue) {
    const loc=gl.getAttribLocation(p,name);
    if(loc<0)return;
    if(buffer){
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);
    }else{
      gl.disableVertexAttribArray(loc);
      const v=defaultValue||[0,0,0,1];
      if(size===2)gl.vertexAttrib2f(loc,v[0],v[1]);
      else if(size===3)gl.vertexAttrib3f(loc,v[0],v[1],v[2]);
      else gl.vertexAttrib4f(loc,v[0],v[1],v[2],v[3]);
    }
  }

  function createBuffer(gl,data,target=gl.ARRAY_BUFFER) {
    const b=gl.createBuffer();gl.bindBuffer(target,b);gl.bufferData(target,data,gl.STATIC_DRAW);return b;
  }

  function canvasBlob(canvas) {
    return new Promise((resolve,reject)=>{
      canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG encoding failed.")),"image/png");
    });
  }

  function alphaMode(mode) {
    mode=String(mode||"").toLowerCase();
    if(mode.includes("mask"))return 1;
    if(mode.includes("blend")||mode.includes("transluc"))return 2;
    return 0;
  }

  async function render(manifest, options={}) {
    const g=manifest.geometry;
    const positions=typed(g.positions,Float32Array);
    const indices32=typed(g.indices,Uint32Array);
    const vertexCount=positions.length/3;

    const normals=g.normals ? typed(g.normals,Float32Array) : calculateNormals(positions,indices32);
    const uv0=g.uv0 ? typed(g.uv0,Float32Array) : null;
    const colors=g.colors ? typed(g.colors,Float32Array) : null;
    const tangents=g.tangents ? typed(g.tangents,Float32Array) : null;

    const outputSize = Math.max(512, Math.min(1024, Number(options.size)||(
      vertexCount<100000?1024:vertexCount<280000?896:768
    )));
    const supersample = vertexCount<250000 ? 2 : 1;
    const renderSize = Math.min(2048,outputSize*supersample);

    const canvas=document.createElement("canvas");
    canvas.width=renderSize;canvas.height=renderSize;

    const gl=canvas.getContext("webgl2",{
      alpha:true,antialias:true,depth:true,premultipliedAlpha:false,
      preserveDrawingBuffer:true,powerPreference:"high-performance"
    })||canvas.getContext("webgl",{
      alpha:true,antialias:true,depth:true,premultipliedAlpha:false,
      preserveDrawingBuffer:true
    });

    if(!gl)throw new Error("WebGL is unavailable.");

    const isGL2=typeof WebGL2RenderingContext!=="undefined"&&gl instanceof WebGL2RenderingContext;
    const uintOK=isGL2||Boolean(gl.getExtension("OES_element_index_uint"));
    if(!uintOK&&vertexCount>65535){
      throw new Error("This device cannot render this large StaticMesh.");
    }

    const indices=uintOK?indices32:new Uint16Array(indices32);
    const indexType=uintOK?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT;
    const bytesPerIndex=uintOK?4:2;

    const p=program(gl);
    gl.useProgram(p);

    const posB=createBuffer(gl,positions);
    const normB=createBuffer(gl,normals);
    const uvB=uv0?createBuffer(gl,uv0):null;
    const colB=colors?createBuffer(gl,colors):null;
    const tanB=tangents?createBuffer(gl,tangents):null;
    const idxB=createBuffer(gl,indices,gl.ELEMENT_ARRAY_BUFFER);

    bindAttribute(gl,p,"aPosition",posB,3,[0,0,0,1]);
    bindAttribute(gl,p,"aNormal",normB,3,[0,0,1,1]);
    bindAttribute(gl,p,"aUV",uvB,2,[0,0,0,1]);
    bindAttribute(gl,p,"aColor",colB,4,[1,1,1,1]);
    bindAttribute(gl,p,"aTangent",tanB,4,[1,0,0,1]);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,idxB);

    const b=boundsOf(positions);
    const model=mat4Multiply(mat4Scale(1/b.radius),mat4Translation(-b.cx,-b.cy,-b.cz));
    const eye=chooseCamera(b);
    const view=lookAt(eye,[0,0,0],[0,0,1]);
    const projection=ortho(-1.10,1.10,-1.10,1.10,0.01,20);
    const mvp=mat4Multiply(projection,mat4Multiply(view,model));

    gl.uniformMatrix4fv(gl.getUniformLocation(p,"uModel"),false,model);
    gl.uniformMatrix4fv(gl.getUniformLocation(p,"uMVP"),false,mvp);
    gl.uniform1i(gl.getUniformLocation(p,"uUseVertexColor"),Boolean(colors)?1:0);

    const white=solidTexture(gl,[255,255,255,255]);
    const normalFlat=solidTexture(gl,[128,128,255,255]);
    const black=solidTexture(gl,[0,0,0,255]);

    const materials=manifest.materials?.length?manifest.materials:[{}];
    const loadedMaterials=[];

    for(const m of materials){
      const [base,normal,emissive,opacity]=await Promise.all([
        imageTexture(gl,m.baseColorTexture,white),
        imageTexture(gl,m.normalTexture,normalFlat),
        imageTexture(gl,m.emissiveTexture,black),
        imageTexture(gl,m.opacityTexture,white)
      ]);
      loadedMaterials.push({m,base,normal,emissive,opacity});
    }

    const sections=manifest.sections?.length?manifest.sections:[{
      firstIndex:0,indexCount:indices.length,materialIndex:0,name:""
    }];

    gl.viewport(0,0,renderSize,renderSize);
    const bg=Array.isArray(options.background)?options.background:DEFAULT_BG;
    gl.clearColor(bg[0]||0,bg[1]||0,bg[2]||0,bg[3]||0);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    for(const s of sections){
      const lm=loadedMaterials[Math.min(s.materialIndex,loadedMaterials.length-1)]||loadedMaterials[0];
      const m=lm.m||{};
      const base=Array.isArray(m.baseColor)?m.baseColor:[1,1,1,1];

      gl.uniform4f(gl.getUniformLocation(p,"uBaseColor"),
        Number(base[0]??1),Number(base[1]??1),Number(base[2]??1),Number(base[3]??1));
      gl.uniform1f(gl.getUniformLocation(p,"uRoughness"),Number(m.roughness??0.62));
      gl.uniform1f(gl.getUniformLocation(p,"uMetallic"),Number(m.metallic??0));
      gl.uniform1f(gl.getUniformLocation(p,"uOpacity"),Number(m.opacity??1));
      gl.uniform1f(gl.getUniformLocation(p,"uOpacityCutoff"),Number(m.opacityCutoff??0.333));
      gl.uniform1i(gl.getUniformLocation(p,"uAlphaMode"),alphaMode(m.opacityMode));
      gl.uniform2f(gl.getUniformLocation(p,"uUVScale"),...(m.uvScale||[1,1]));
      gl.uniform2f(gl.getUniformLocation(p,"uUVOffset"),...(m.uvOffset||[0,0]));

      const texList=[
        ["uBaseMap","uHasBaseMap",lm.base,0,Boolean(uv0&&lm.base.loaded)],
        ["uNormalMap","uHasNormalMap",lm.normal,1,Boolean(uv0&&tangents&&lm.normal.loaded)],
        ["uEmissiveMap","uHasEmissiveMap",lm.emissive,2,Boolean(uv0&&lm.emissive.loaded)],
        ["uOpacityMap","uHasOpacityMap",lm.opacity,3,Boolean(uv0&&lm.opacity.loaded)]
      ];

      for(const [sampler,flag,obj,unit,enabled] of texList){
        gl.activeTexture(gl.TEXTURE0+unit);
        gl.bindTexture(gl.TEXTURE_2D,obj.texture);
        gl.uniform1i(gl.getUniformLocation(p,sampler),unit);
        gl.uniform1i(gl.getUniformLocation(p,flag),enabled?1:0);
      }

      const first=Math.max(0,Math.min(indices.length,Number(s.firstIndex)||0));
      let count=Math.max(0,Math.min(indices.length-first,Number(s.indexCount)||0));
      count-=count%3;
      if(count>0)gl.drawElements(gl.TRIANGLES,count,indexType,first*bytesPerIndex);
    }

    gl.finish();

    let finalCanvas=canvas;
    if(renderSize!==outputSize){
      finalCanvas=document.createElement("canvas");
      finalCanvas.width=outputSize;finalCanvas.height=outputSize;
      const ctx=finalCanvas.getContext("2d",{alpha:true});
      if(!ctx)throw new Error("High quality canvas is unavailable.");
      ctx.imageSmoothingEnabled=true;
      ctx.imageSmoothingQuality="high";
      ctx.clearRect(0,0,outputSize,outputSize);
      ctx.drawImage(canvas,0,0,outputSize,outputSize);
    }

    const blob=await canvasBlob(finalCanvas);

    for(const lm of loadedMaterials){
      for(const item of [lm.base,lm.normal,lm.emissive,lm.opacity]){
        if(item.loaded&&item.texture)gl.deleteTexture(item.texture);
      }
    }
    gl.deleteTexture(white);gl.deleteTexture(normalFlat);gl.deleteTexture(black);
    for(const bfr of [posB,normB,uvB,colB,tanB,idxB])if(bfr)gl.deleteBuffer(bfr);
    gl.deleteProgram(p);

    return {
      blob,
      width:outputSize,
      height:outputSize,
      renderSize,
      vertexCount,
      triangleCount:indices.length/3,
      materialCount:materials.length,
      textured:Boolean(uv0&&loadedMaterials.some(x=>x.base.loaded)),
      normalMapped:Boolean(uv0&&tangents&&loadedMaterials.some(x=>x.normal.loaded)),
      bounds:b
    };
  }

  window.NovaSparxRenderer=Object.freeze({
    version:"0.1.0-alpha",
    render
  });

  console.info("NovaSparx Renderer 0.1 alpha loaded.");
})();
