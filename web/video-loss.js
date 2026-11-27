import * as T from '/three.js';

// Render into the same WebGL canvas as the camera so MJPEG also loses signal.
export function createVideoLoss(){
 const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
 const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{time:{value:0}},
  vertexShader:'void main(){gl_Position=vec4(position.xy,0.0,1.0);}',
  fragmentShader:`uniform float time;
   void main(){
    vec2 p=floor(gl_FragCoord.xy/2.0);float frame=floor(time*25.0);
    float noise=fract(sin(dot(p+frame,vec2(12.9898,78.233)))*43758.5453);
    float scan=.82+.18*sin(gl_FragCoord.y*.7+frame);
    gl_FragColor=vec4(vec3(noise*scan),1.0);
   }`});
 const geometry=new T.PlaneGeometry(2,2),mesh=new T.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
 return {render(renderer,now){material.uniforms.time.value=now/1000;renderer.render(scene,camera);},dispose(){geometry.dispose();material.dispose();}};
}
