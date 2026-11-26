import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sunAppearance,roadWetness} from '../web/sky-palette.js';

test('sunAppearance hides below horizon or heavy overcast and warms near sunset',()=>{
 const night=sunAppearance({elevationDeg:-5},{cloud:0});
 assert.equal(night.visible,false);

 const clearNoon=sunAppearance({elevationDeg:60},{cloud:0});
 assert.equal(clearNoon.visible,true);
 assert.ok(clearNoon.opacity>0.9);
 assert.ok(clearNoon.color[2]>0.85,'noon sun stays crisp white-warm');

 const sunset=sunAppearance({elevationDeg:2},{cloud:0});
 assert.equal(sunset.visible,true);
 assert.ok(sunset.color[2]<clearNoon.color[2],'sunset sun shifts warmer');
 assert.ok(sunset.scale>clearNoon.scale,'sunset sun disc blooms slightly larger');

 const overcast=sunAppearance({elevationDeg:45},{cloud:1});
 assert.ok(overcast.opacity<0.2,'overcast heavily attenuates sun sprite');
});

test('roadWetness darkens roads and lowers paved roughness during rain',()=>{
 const dry=roadWetness({precipitation:null,precipitationStrength:0},true);
 assert.equal(dry.tint,1);
 assert.equal(dry.roughness,1);

 const rainPaved=roadWetness({precipitation:'rain',precipitationStrength:1},true);
 const rainDirt=roadWetness({precipitation:'rain',precipitationStrength:1},false);
 assert.ok(rainPaved.tint<1&&rainDirt.tint<1);
 assert.ok(rainPaved.roughness<rainDirt.roughness,'paved roads become glossier than dirt when wet');

 const snow=roadWetness({precipitation:'snow',precipitationStrength:1},true);
 assert.equal(snow.roughness,1);
});
