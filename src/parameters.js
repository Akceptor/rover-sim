// Deliberately narrow: never copy hardware, sensor, EKF, serial or SIM settings.
export const allowedParameters=new Set(['CRUISE_SPEED','CRUISE_THROTTLE','WP_SPEED','WP_SPEED_MIN','WP_RADIUS','TURN_RADIUS','ATC_ACCEL_MAX','ATC_DECEL_MAX','ATC_STR_RAT_MAX','ATC_STR_RAT_FF','ATC_STR_RAT_P','ATC_STR_RAT_I','ATC_STR_RAT_D','ATC_SPEED_P','ATC_SPEED_I','ATC_SPEED_D','ATC_TURN_MAX_G']);
export function selectParameters(text,selected){
  const accepted={},rejected=[];
  for(const line of text.split(/\r?\n/)){
    const clean=line.split('#')[0].trim();if(!clean)continue;
    const [name,raw]=clean.split(/[\s,=]+/);if(!selected.includes(name))continue;
    if(!allowedParameters.has(name)){rejected.push(name);continue;}
    const value=Number(raw);if(raw===undefined||!Number.isFinite(value))throw Error(`invalid value for ${name}`);accepted[name]=value;
  }
  return {accepted,rejected};
}
