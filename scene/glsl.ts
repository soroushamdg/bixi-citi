/** Shared GLSL snippets. */

/** 2D simplex noise (Ashima / Stefan Gustavson, MIT). */
export const SNOISE = /* glsl */ `
vec3 sn_mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 sn_mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 sn_perm(vec3 x){return sn_mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=sn_mod289(i);
  vec3 p=sn_perm(sn_perm(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;
  vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}`;

export const HASH = /* glsl */ `float h21(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}`;
