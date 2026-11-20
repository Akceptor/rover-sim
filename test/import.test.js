import {test} from 'node:test';import assert from 'node:assert/strict';
import {selectParameters} from '../src/parameters.js';
test('only chosen tuning params pass, never simulation or calibration settings',()=>{const r=selectParameters('CRUISE_SPEED,1.5\nSERVO2_FUNCTION 26\nINS_ACCOFFS_X 99\nGPS1_TYPE 0\nSIM_RATE_HZ 1\nSERIAL0_PROTOCOL -1\nCRUISE_THROTTLE 40\n', ['CRUISE_SPEED','GPS1_TYPE']);assert.deepEqual(r.accepted,{CRUISE_SPEED:1.5});assert.ok(r.rejected.includes('GPS1_TYPE'));assert.throws(()=>selectParameters('CRUISE_SPEED NaN',['CRUISE_SPEED']));});
