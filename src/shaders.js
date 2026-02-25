// Vertex shader shared by all GL visualizers
export const VS_SOURCE = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const STARNEST_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  #define iterations 17
  #define formuparam 0.53
  #define volsteps 20
  #define stepsize 0.1
  #define zoom   0.800
  #define tile   0.850
  #define speed  0.010 
  #define brightness 0.0015
  #define darkmatter 0.300
  #define distfading 0.730
  #define saturation 0.850

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord.xy / iResolution.xy - 0.5;
    uv.y *= iResolution.y / iResolution.x;
    vec3 dir = vec3(uv * zoom, 1.0);
    float time = iTime * speed + 0.25;

    float a1 = 0.5 / iResolution.x;
    float a2 = 0.8 / iResolution.y;
    mat2 rot1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1));
    mat2 rot2 = mat2(cos(a2), sin(a2), -sin(a2), cos(a2));
    dir.xz *= rot1;
    dir.xy *= rot2;
    vec3 from = vec3(1.0, 0.5, 0.5);
    from += vec3(time * 2.0, time, -2.0);
    from.xz *= rot1;
    from.xy *= rot2;

    float s = 0.1, fade = 1.0;
    vec3 v = vec3(0.0);
    for (int r = 0; r < volsteps; r++) {
      vec3 p = from + s * dir * 0.5;
      p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));
      float pa, a = pa = 0.0;
      for (int i = 0; i < iterations; i++) {
        p = abs(p) / dot(p, p) - formuparam;
        a += abs(length(p) - pa);
        pa = length(p);
      }
      float dm = max(0.0, darkmatter - a * a * 0.001);
      a *= a * a;
      if (r > 6) fade *= 1.0 - dm;
      v += fade;
      v += vec3(s, s * s, s * s * s * s) * a * brightness * fade;
      fade *= distfading;
      s += stepsize;
    }
    v = mix(vec3(length(v)), v, saturation);
    vec4 result = vec4(v * 0.015, 1.0);
    float glow = iAudio * 1.5; 
    result.rgb *= (1.0 + glow * 3.0);
    if (glow > 2.0) {
      result.rgb += vec3(glow * 0.2, glow * 0.1, glow * 0.4);
    }
    gl_FragColor = result;
}
`;

export const DUSTY_MENGER_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  uniform sampler2D iChannel0;

  #define T (iTime * 1.2)
  
  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

  vec3 P(float z) {
    return vec3(cos(z * 0.1) * 16.0, cos(z * 0.025) * 2.0 - 24.0, z);
}

  float tunnel(vec3 p) {
    vec3 path = P(p.z);
    vec3 q = abs(p - path);
    return 0.3 - length(max(q.xy, 0.0));
}

  float box(vec3 p, float i) {
    vec3 q = i * 0.44 - abs(mod(p, i) - i * 0.5);
    return min(q.x, min(q.y, q.z));
}

  float boxen(vec3 p) {
    float d = -99.0, i = 10.0;
    vec3 p_rot = p;
    for(int m=0; m<6; m++) {
      p_rot.xz *= rot(0.6);
      d = max(d, box(p_rot, i));
      i *= 0.35;
    }
    return d;
}

  float map(vec3 p) {
    float ground = 4.0 * dot(sin(p * 0.33), vec3(0.3)) - 18.0 - p.y;
    ground += iAudio * 1.5 * sin(p.z * 0.2 + iTime * 4.0);
    return min(ground, max(tunnel(p), boxen(p)));
}

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
    uv.yx -= 0.3;

    vec3 ro = P(T);
    vec3 target = P(T + 6.0);
    vec3 z = normalize(target - ro);
    vec3 x = normalize(cross(vec3(0, 1, 0), z));
    vec3 y = cross(z, x);
    vec3 rd = normalize(mat3(x, y, z) * vec3(uv, 1.0));

    float d = 0.0, t_dist = 0.01;
    vec4 o = vec4(0.0);
    
    for(int m=0; m<80; m++) {
      float res = map(ro + rd * t_dist);
      o += res; 
      t_dist += res * 0.8;
      if (t_dist > 50.0) break;
    }

    vec3 col = o.rgb / 12.0;
    col = col / (1.0 + col); 
    
    vec3 p_hit = ro + rd * t_dist;
    vec3 detail = texture2D(iChannel0, p_hit.xz * 0.1).rgb;
    col *= (0.5 + detail * 1.5);
    
    col *= vec3(3.5, 1.8, 0.9);
    col *= (1.0 + iAudio * 1.2);
    
    gl_FragColor = vec4(col, 1.0);
}
`;

export const INDUSTRIAL_3D_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

  float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

  float map(vec3 p) {
    vec3 p1 = p;
    p1.xz *= rot(iTime * 0.5);
    float d = sdCylinder(p1, 0.5, 10.0);
    
    for(int i=0; i<5; i++) {
        float fi = float(i);
        vec3 p2 = p;
        p2.y -= (fi - 2.0) * 2.5;
        float reactive = iAudio * 0.8;
        p2.xz *= rot(iTime * (fi + 1.0) * 0.3);
        float ring = max(sdCylinder(p2, 1.2 + reactive, 0.2), -sdCylinder(p2, 1.0 + reactive, 0.3));
        
        vec3 p3 = p2;
        float angle = atan(p3.z, p3.x);
        float teeth = cos(angle * 12.0) * 0.1;
        ring += teeth;
        
        d = min(d, ring);
    }
    
    vec3 p4 = mod(p + 5.0, 10.0) - 5.0;
    float pipes = min(sdCylinder(p4.xzy, 0.1, 10.0), sdCylinder(p4.yxz, 0.1, 10.0));
    d = min(d, pipes);

    return d;
}

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - iResolution.xy) / iResolution.y;
    vec3 ro = vec3(0, 5, -12);
    vec3 rd = normalize(vec3(uv, 1.2));
    
    float shake = iAudio * 0.15;
    ro += vec3(sin(iTime * 30.0), cos(iTime * 25.0), 0.0) * shake;

    ro.xz *= rot(iTime * 0.05);
    rd.xz *= rot(iTime * 0.05);

    float t = 0.01;
    for(int i=0; i<80; i++) {
      float d = map(ro + rd * t);
      if(d < 0.0005 || t > 40.0) break;
      t += d * 0.8;
    }

    vec3 col = vec3(0.02, 0.02, 0.03);
    if(t < 40.0) {
      vec3 p = ro + rd * t;
      vec3 n = normalize(vec3(
        map(p + vec3(0.005, 0, 0)) - map(p - vec3(0.005, 0, 0)),
        map(p + vec3(0, 0.005, 0)) - map(p - vec3(0, 0.005, 0)),
        map(p + vec3(0, 0, 0.005)) - map(p - vec3(0, 0, 0.005))
      ));
      
      float diff = max(0.0, dot(n, normalize(vec3(1, 2, 3))));
      float spec = pow(max(0.0, dot(reflect(rd, n), normalize(vec3(1, 2, 3)))), 16.0);
      float ao = clamp(map(p + n * 0.1) / 0.1, 0.0, 1.0);
      
      vec3 metal = vec3(0.15, 0.16, 0.18);
      vec3 rust = vec3(0.2, 0.08, 0.02);
      float noise = fract(sin(dot(p.xy, vec2(12.9898, 78.233))) * 43758.5453);
      vec3 base = mix(metal, rust, noise * 0.4);
      
      col = base * diff * ao + spec * 0.3 * ao;
      
      float pulse = sin(iTime * 4.0) * 0.5 + 0.5;
      float lightPos = mod(p.y + iTime, 5.0);
      if(abs(lightPos - 2.5) < 0.2) {
          col += vec3(1.0, 0.3, 0.05) * pulse * (0.5 + iAudio * 5.0);
      }
      
      if(iAudio > 0.6 && fract(sin(iTime * 100.0)) > 0.95) {
          col += vec3(0.6, 0.8, 1.0) * 2.0;
      }
    }

    col = mix(col, vec3(0.02, 0.02, 0.04), 1.0 - exp(-0.04 * t));
    col = pow(col, vec3(1.1));
    col *= 1.2;

    gl_FragColor = vec4(col, 1.0);
}
`;

export const CURSED_4D_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  uniform sampler2D iChannel0;

  #define FAR 80.
  #define MAX_ITER 120

  const float CAM_Y_POS = 1.7;
  const float CORRIDOR_HALF_WIDTH = 1.5;
  const float CORRIDOR_HALF_HEIGHT = 1.0;

  mat2 rot(float th) {
    float c = cos(th), s = sin(th);
    return mat2(c, s, -s, c);
}

  vec3 tex3D(sampler2D channel, vec3 p, vec3 n) {
    n = max(abs(n), 0.001);
    n /= dot(n, vec3(1.0));
    vec3 tx = texture2D(channel, p.zy).xyz;
    vec3 ty = texture2D(channel, p.xz).xyz;
    vec3 tz = texture2D(channel, p.xy).xyz;
    return tx*tx*n.x + ty*ty*n.y + tz*tz*n.z;
}

  float xor_approx(float x, float y) {
    float res = 0.0;
    float tx = floor(abs(x));
    float ty = floor(abs(y));
    for (float i = 0.0; i < 8.0; i++) {
        float p = pow(2.0, i);
        float bx = mod(floor(tx / p), 2.0);
        float by = mod(floor(ty / p), 2.0);
        if (bx != by) res += p;
    }
    return res;
}

  float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

  float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

  float sdBox2D(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

  vec3 camPath(float t) {
    return vec3(0.0, CAM_Y_POS, t);
}

  float MengerSpongeXOR(vec3 p_orig, float time) {
    float d = 0.0;
    float s = 16.0;

    vec3 p_fold = abs(mod(p_orig, s) - s/2.0);
    float x1 = floor(p_orig.x / s) * 5.0 + time * 0.3;
    float y1 = floor(p_orig.y / s) * 3.0;
    float x_m1 = mod(xor_approx(x1, y1), 45.0);
    float offset1 = (mod(x_m1, 9.0) - 4.0) * 0.1 * (s / 16.0);
    float d1_m = min(max(p_fold.x, p_fold.y), min(max(p_fold.y, p_fold.z), max(p_fold.x, p_fold.z))) - s/3.0 + 1.0 + offset1;
    d = max(d, d1_m);
    s /= 4.0;

    p_fold = abs(mod(p_orig, s) - s/2.0);
    float x2 = floor(p_orig.x / s) * 7.0 - time * 0.2;
    float y2 = floor(p_orig.z / s) * 2.0;
    float x_m2 = mod(xor_approx(x2, y2), 23.0);
    float offset2 = (mod(x_m2, 7.0) - 3.0) * 0.05 * (s / 4.0);
    float d2_m = min(max(p_fold.x, p_fold.y), min(max(p_fold.y, p_fold.z), max(p_fold.x, p_fold.z))) - s/3.0 + offset2;
    d = max(d, d2_m);

    return d;
}

  float map(vec3 p) {
    float d = FAR;
    vec3 p_menger = p;
    p_menger.xy *= rot(iTime * 0.02);
    d = min(d, MengerSpongeXOR(p_menger, iTime));

    vec3 p_rep = p;
    float scale_rep = 8.0 + 4.0 * sin(iTime * 0.1);
    p_rep.xz *= rot(iTime * 0.05);
    vec3 cell_id_rep = floor(p_rep / scale_rep);
    vec3 q_rep = mod(p_rep, scale_rep) - scale_rep / 2.0;

    float mod_place = xor_approx(xor_approx(cell_id_rep.x, cell_id_rep.y + floor(iTime * 0.5)), cell_id_rep.z);
    mod_place = mod(mod_place, 19.0);

    if (mod_place < 2.0) d = min(d, sdBox(q_rep, vec3(scale_rep * 0.2)));
    else if (mod_place < 4.0) d = min(d, sdSphere(q_rep, scale_rep * 0.25));
    else if (mod_place < 6.0) d = max(d, -sdSphere(q_rep, scale_rep * 0.15));

    vec3 p_corridor = p;
    p_corridor.y -= CAM_Y_POS;
    float corridor_carve = sdBox2D(p_corridor.xy, vec2(CORRIDOR_HALF_WIDTH, CORRIDOR_HALF_HEIGHT));
    corridor_carve += iAudio * 0.2 * sin(p.z * 1.5 + iTime * 4.0);

    return max(d, -corridor_carve) * 0.95;
}

  vec3 nr(vec3 p, float t) {
    vec2 e = vec2(0.005 * min(1.0 + t, 5.0), 0.0);
    return normalize(vec3(
        map(p + e.xyy) - map(p - e.xyy),
        map(p + e.yxy) - map(p - e.yxy),
        map(p + e.yyx) - map(p - e.yyx)
    ));
}

  float cao(in vec3 p, in vec3 n) {
      float sca = 1., occ = 0.;
      for(float i=0.; i<5.; i++){
          float hr = .01 + i*.5/4.;
          float dd = map(n * hr + p);
          occ += (hr - dd)*sca;
          sca *= 0.7;
      }
      return clamp(1.0 - occ, 0., 1.);
}

  float softShadow(vec3 ro, vec3 lp, float k) {
      vec3 rd = lp - ro;
      float end = length(rd);
      rd = normalize(rd);
      float shade = 1.0;
      float dist = 0.05;
      for (int i=0; i < 20; i++){
          float h = map(ro + rd*dist);
          shade = min(shade, k*h/dist);
          dist += clamp(h, 0.01, 0.2);
          if (h<0.001 || dist > end) break;
      }
      return clamp(shade, 0.0, 1.0) + 0.2;
}

  vec3 doBumpMap(vec3 p, vec3 n, float bf) {
      vec2 e = vec2(0.001, 0);
      vec3 tx = tex3D(iChannel0, p * 0.2, n);
      float f = dot(tx, vec3(0.299, 0.587, 0.114));
      float fx = dot(tex3D(iChannel0, (p - e.xyy) * 0.2, n), vec3(0.299, 0.587, 0.114));
      float fy = dot(tex3D(iChannel0, (p - e.yxy) * 0.2, n), vec3(0.299, 0.587, 0.114));
      float fz = dot(tex3D(iChannel0, (p - e.yyx) * 0.2, n), vec3(0.299, 0.587, 0.114));
      vec3 g = vec3(f - fx, f - fy, f - fz) / e.x;
      g -= n * dot(n, g);
      return normalize(n + g * bf);
}

  void main() {
    vec2 u = (gl_FragCoord.xy - iResolution.xy * 0.5) / iResolution.y;
    float cam_speed = 3.0;
    vec3 ro = camPath(iTime * cam_speed);
    vec3 lk = camPath(iTime * cam_speed + 0.5);

    vec3 fwd = normalize(lk - ro);
    vec3 rgt = normalize(vec3(fwd.z, 0.0, -fwd.x));
    vec3 up = cross(fwd, rgt);
    vec3 rd = normalize(fwd + (u.x * rgt + u.y * up) * 0.8);

    float t = 0.0, d, glow = 0.0;
    for (int i = 0; i < MAX_ITER; i++) {
        d = map(ro + rd * t);
        if (abs(d) < 0.001 * (t * 0.125 + 1.0) || t > FAR) break;
        t += d;
        glow += (1.0 / (1.0 + d * d * 100.0)) * (0.01 + iAudio * 0.02);
    }

    vec3 col = vec3(0.02, 0.03, 0.05);
    if (t < FAR) {
        vec3 sp = ro + rd * t;
        vec3 sn = nr(sp, t);
        float ao = cao(sp, sn);
        sn = doBumpMap(sp, sn, 0.25 / (1.0 + t * 0.1));
        
        vec3 lp = camPath(iTime * cam_speed + 3.0);
        lp.x += sin(iTime * 0.4) * 5.0;
        lp.y += 2.0;

        float sh = softShadow(sp, lp, 16.0);
        vec3 ld = normalize(lp - sp);
        
        float diff = max(dot(sn, ld), 0.0);
        float spec = pow(max(dot(reflect(rd, sn), ld), 0.0), 16.0);
        float fre = pow(clamp(1.0 + dot(sn, rd), 0.0, 1.0), 3.0);
        
        vec3 snap = tex3D(iChannel0, sp * 0.2, sn);
        snap = pow(snap, vec3(1.5)) * 1.5;
        vec3 base = mix(vec3(0.15, 0.18, 0.22), snap, 0.85);

        if (mod(floor(sp.z * 0.5), 2.0) == 0.0) base *= vec3(1.4, 0.7, 0.3);
        
        col = base * (diff + 0.15) + vec3(0.8, 0.9, 1.0) * spec * 2.0 + vec3(0.5, 0.7, 1.0) * fre * 0.5;
        col *= ao * sh;
        
        col = mix(col, vec3(0.005, 0.01, 0.02), smoothstep(0.0, 1.0, t/FAR));
    }
    
    col += vec3(0.3, 0.4, 0.6) * glow * iAudio;

    vec2 q = gl_FragCoord.xy / iResolution.xy;
    col *= 0.5 + 0.5 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.25);
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.2);
    col = pow(max(col, 0.0), vec3(0.4545));
    
    gl_FragColor = vec4(col, 1.0);
}
`;

export const LIQUID_ACID_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec2 p = -1.0 + 2.0 * uv;
    p.x *= iResolution.x / iResolution.y;

    float speed = iTime * 0.5 + iAudio * 0.5;
    
    for(int i=1; i<10; i++) {
        float f = float(i);
        p.x += 0.3 / f * sin(f * p.y + speed + 0.3 * f);
        p.y += 0.3 / f * cos(f * p.x + speed + 0.5 * f);
    }

    float r = 0.5 + 0.5 * sin(p.x + p.y + 1.0);
    float g = 0.5 + 0.5 * sin(p.x + p.y + 2.0 + iAudio);
    float b = 0.5 + 0.5 * sin(p.x + p.y + 3.0);
    
    vec3 col = vec3(r, g, b);
    col *= 1.0 + iAudio * 0.5;
    
    // Add some pulsing rings
    float d = length(p);
    col += 0.1 * sin(d * 10.0 - iTime * 5.0) * iAudio;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const SURVEILLANCE_FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform float iAudio;

  float focalDistance = 10.;
  float aperature = .04;
  float fudgeFactor = .9; 
  float shadowCone = .5;
  vec4 orbitTrap = vec4(0.);
  float pixelSize;
  vec4 col = vec4(0.0);
  float rCoC, h;
  vec3 pcoc = vec3(0.0);

  float rand1(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  float linstep(float a, float b, float t) {
    return clamp((t-a)/(b-a), 0., 1.);
  }

  float CircleOfConfusion(float t) { 
    return max(abs(focalDistance-t)*aperature, pixelSize*(1.0+t));
  }

  float NewMenger(vec3 q) {
    float reactive = iAudio * 0.15;
    vec3 p = abs(fract(q/3.)*3. - 1.5);
    float d = min(max(p.x, p.y), min(max(p.y, p.z), max(p.x, p.z))) - 1. + .05 + reactive * 0.3;
    p = abs(fract(q) - .5);
    d = max(d, min(max(p.x, p.y), min(max(p.y, p.z), max(p.x, p.z))) - 1./3. + .05 - reactive * 0.05);
    p = abs(fract(q*2.)*.5 - .25);
    d = max(d, min(max(p.x, p.y), min(max(p.y, p.z), max(p.x, p.z))) - .5/3. - .015 - reactive * 0.1); 
    p = abs(fract(q*3./.5)*.5/3. - .5/6.);
    return max(d, min(max(p.x, p.y), min(max(p.y, p.z), max(p.x, p.z))) - 1./18. - .015);
  }

  float map(vec3 p) {
    orbitTrap = vec4(length(p)-0.8*p.z, length(p)-0.8*p.y, length(p)-0.8*p.x, iAudio * 0.3); 
    return NewMenger(p);
  }

  float FuzzyShadow(vec3 ro, vec3 rd, float coneGrad, float rCoC) {
    float t=rCoC*2.0, s=1.0;
    for(int i=0; i<9; i++) {
        if(s<0.1) continue;
        float r=rCoC+t*coneGrad+0.05;
        float d=map(ro+rd*t)+r*0.6;
        s*=linstep(-r, r, d);
        t+=abs(d)*(0.8+0.2*rand1(gl_FragCoord.xy*vec2(float(i))));
    }
    return clamp(s*0.99+0.01, 0.0, 1.0);
  }

  vec3 cycle(vec3 c, float s) {
    return vec3(0.5)+0.5*vec3(cos(s*4.0+c.x), cos(s*4.0+c.y), cos(s*4.0+c.z));
  }

  vec3 getColor() {
    orbitTrap.w = sqrt(orbitTrap.w);
    vec3 X = vec3(0.6, 0.5, 0.6), Y = vec3(1.0, 0.5, 0.1), Z = vec3(0.7, 0.8, 1.0);
    vec3 orbitColor = cycle(X, orbitTrap.x)*0.2*orbitTrap.x + cycle(Y, orbitTrap.y)*0.7*orbitTrap.y + cycle(Z, orbitTrap.z)*0.3*orbitTrap.z;
    vec3 baseCol = mix(vec3(0.2), 3.0*orbitColor, vec3(0.8));
    return baseCol * (1.0 + iAudio * 0.5);
  }

  void castRay(vec3 ro, vec3 rd) {
    vec3 lig = normalize(vec3(0.4+cos((25.+iTime)*0.33), 0.2, 0.6));		
    float t = 0.;
    for (int i = 0; i < 64; i++) {
        if(col.w>0.999 || t>15.0) continue;
        rCoC = CircleOfConfusion(t);
        h = map(ro)+0.5*rCoC;
        if(h<rCoC) {
            pcoc = ro-rd*abs(h-rCoC);
            vec2 v = vec2(rCoC*0.5, 0.0);
            vec3 N = normalize(vec3(-map(pcoc-v.xyy)+map(pcoc+v.xyy), -map(pcoc-v.yxy)+map(pcoc+v.yxy), -map(pcoc-v.yyx)+map(pcoc+v.yyx)));
            vec3 scol = 2.3*getColor();	
            scol *= 0.5*clamp(dot(lig, N), 0.0, 1.0) + pow(clamp(dot(reflect(rd, N), lig), 0.0, 1.0), 16.0);
            scol *= FuzzyShadow(pcoc, lig, shadowCone, rCoC);
            float alpha = (1.0-col.w)*linstep(-rCoC, rCoC, -h*1.7);
            col += vec4(scol*alpha, alpha);
        }
        ro += abs(fudgeFactor*h*(0.3+0.05*rand1(gl_FragCoord.xy*vec2(float(i))))) * rd;
        t += h;
    }
  }

  void main() {
    focalDistance = 6.5+3.*cos((25.+iTime)*0.133) + iAudio * 0.8; 
    pixelSize = 1.0/iResolution.y;
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    vec3 rd = normalize(vec3((uv.x*2.0-1.0) * iResolution.x/iResolution.y, uv.y * 2.0 - 1.0, 2.0));
    vec2 m = sin(vec2(0, 1.5707) + (25. + iTime) / 4.0);
    mat2 rotM = mat2(m.y, -m.x, m.x, m.y);
    rd.xy = rotM * rd.xy;
    rd.xz = rotM * rd.xz;
    vec3 ro = vec3(0.0, 2.0, 5.+sin((25.+iTime)/2.0));
    ro += (vec3(rand1(uv+iTime), rand1(uv+iTime+1.0), rand1(uv+iTime+2.0)) - 0.5) * iAudio * 0.05;
    castRay(ro, rd);
    vec3 finalCol = col.rgb * 0.7 + vec3(0.03, 0.02, 0.01) * iAudio;
    gl_FragColor = vec4(finalCol - 0.1*rand1(uv*iTime), 1.0);
  }
`;
