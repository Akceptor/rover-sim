const num=(path,label,unit,step,help)=>({path,label,unit,step,help,type:'number'});
const select=(path,label,options,help)=>({path,label,options,help,type:'select'});
const xyz=(path,label,help)=>['x','y','z'].map((a,i)=>num(`${path}.${a}`,`${label} ${a.toUpperCase()}`,'m',.005,`${help} ${['X is forward/backward; positive moves forward.','Y is vertical; positive moves upward.','Z is left/right; positive moves right.'][i]}`));
export const SECTIONS=[
 {title:'Camera settings',className:'pe-camera',fields:[
  num('fpvFov','Field of view','°',1,'Vertical angle visible in the FPV camera. Higher values show more surroundings and make objects appear smaller.'),
  ...xyz('cameraMount','Camera position','Camera offset from the chassis origin. Changes the viewpoint used by FPV and video output.')
 ]},
 {title:'Chassis settings',className:'pe-chassis',fields:[
  {path:'name',label:'Profile name',type:'text',help:'Display name in the cockpit vehicle selector.'},
  {path:'id',label:'Profile ID',type:'text',readonly:true,help:'Directory name under config/vehicles. Use Duplicate as to create another profile ID.'},
  select('drivetrain','Steering & drive',[['wheeled','Wheeled · Ackermann'],['tracked','Tracked · tank steering']],'Wheeled vehicles steer the front wheels. Tracked vehicles turn by driving the left and right tracks at different speeds.'),
  num('mass','Mass','kg',.1,'Total simulated mass. Affects acceleration, suspension loading, traction and resistance to tipping.'),
  num('length','Body length','m',.01,'Chassis length along X. Resizes the rendered body and collision shapes.'),
  num('width','Body width','m',.01,'Chassis width along Z. Resizes the rendered body and collision shapes.'),
  num('height','Body height','m',.01,'Chassis reference height along Y. Resizes body geometry and collision shapes, including the upper body.'),
 ],groups:[
  {title:'Mass distribution & running gear',fields:[
   ...xyz('centerOfGravity','CoG','Center of gravity relative to the chassis origin. Moves the balance point; affects weight transfer and tipping stability.'),
   num('wheelbase','Wheelbase','m',.01,'Distance between front and rear axles. Affects the contact footprint and turning radius.'),
   num('track','Track spacing','m',.01,'Distance between left and right wheel or track centerlines. Affects lateral stability and tank turning leverage.'),
   num('wheelRadius','Wheel radius','m',.005,'Rolling wheel radius. Affects ground clearance, obstacle climbing and wheel speed.'),
   num('wheelWidth','Wheel width','m',.005,'Rendered tyre width and the lateral contact footprint for multi-ray wheels.'),
   num('suspension','Suspension rest length','m',.005,'Unloaded suspension length below the chassis origin. Affects ride height and wheel placement.'),
  ]},
  {title:'Wheel steering & contact',drivetrain:'wheeled',fields:[
   num('maxSteer','Maximum steering angle','rad',.01,'Maximum front-wheel steering angle. Higher values permit tighter turns.'),
   num('steerRate','Steering speed','rad/s',.5,'Maximum rate of steering angle change. Lower values make steering respond more gradually.'),
   num('ackermannFactor','Ackermann factor','0–1',.05,'0 steers the front wheels in parallel; 1 gives the inner wheel a tighter angle to follow a shared turning center.'),
   select('contactModel','Wheel contact',[['ray','Single ray'],['multi-ray','Multiple rays']],'Single ray samples one ground contact per wheel. Multiple rays sample a wider footprint for obstacle contact at greater physics cost.'),
  ]},
  {title:'Power & braking',fields:[
   num('engineForce','Drive force','N',.1,'Available engine force distributed to driven wheels or tracks. Higher values improve acceleration and climbing.'),
   num('maxSpeed','Maximum drive speed','m/s',.1,'Speed at which engine force tapers away. Sets the powered speed limit.'),
   num('rollingResistance','Rolling resistance','N',.1,'Passive force opposing forward or backward movement. Higher values slow coasting more quickly.'),
   num('brakeImpulse','Brake impulse','',.01,'Base braking strength at the physics reference timestep. Multiplied by neutral and reversing brake settings.'),
  ]},
  {title:'Wheel torque & differentials',drivetrain:'wheeled',fields:[
   num('torqueSplit','Front torque share','0–1',.05,'Fraction of engine force sent to the front axle. 0 is rear drive; 1 is front drive; 0.5 splits evenly.'),
   ...['front','rear'].map(a=>select(`diff.${a}`,`${a==='front'?'Front':'Rear'} differential`,['locked','open'],'Locked couples wheel speeds across the axle to improve traction. Open allows different speeds in turns but can lose drive when a wheel unloads.')),
  ]},
  {title:'Throttle response',fields:[
   num('drive.deadband','Throttle deadband','0–1',.005,'Input range around neutral that produces no drive. Increase to suppress small control fluctuations.'),
   num('drive.riseRate','Throttle rise rate','1/s',.05,'How quickly drive output rises toward requested throttle. Lower values soften acceleration.'),
   num('drive.fallRate','Throttle fall rate','1/s',.05,'How quickly drive output falls when throttle is released. Lower values smooth deceleration.'),
   num('drive.reverseThreshold','Reverse speed threshold','m/s',.005,'Vehicle must slow below this speed before opposite-direction drive engages. Prevents instant reversal.'),
   num('drive.neutralBrake','Neutral braking','',.05,'Multiplier for brake strength at neutral throttle. 0 allows coasting; higher values hold the vehicle more firmly.'),
   num('drive.reverseBrake','Reversing braking','',.05,'Brake multiplier while opposite-direction throttle is requested and the vehicle is still moving too fast to reverse.'),
  ]},
  {title:'Suspension & grip',fields:[
   num('suspensionTuning.stiffness','Spring stiffness','',.1,'Suspension spring strength. Higher values resist compression and produce a firmer ride.'),
   num('suspensionTuning.compression','Compression damping','',.1,'Resistance while suspension compresses. Reduces bouncing when hitting obstacles.'),
   num('suspensionTuning.relaxation','Rebound damping','',.1,'Resistance while suspension extends. Controls how quickly wheels return after compression.'),
   num('suspensionTuning.travel','Suspension travel','m',.005,'Maximum suspension movement from its rest position. Affects terrain following and ride clearance.'),
   num('suspensionTuning.maxForce','Maximum suspension force','N',1,'Limits the force a suspension contact can support. Too low allows the chassis to sag under load.'),
   num('suspensionTuning.grip','Contact grip','',.1,'Contact friction limit. Higher values resist sliding and transfer more drive force to the ground.'),
   num('suspensionTuning.sideGrip','Lateral tyre grip','',.1,'Extra lateral resistance for wheeled vehicles. Higher values resist sideways sliding in turns.'),
  ]},
  {title:'Track geometry',drivetrain:'tracked',fields:[
   num('trackGeometry.length','Track length','m',.01,'Total fore-aft track footprint, including rounded ends. Affects ground support and the rendered belt.'),
   num('trackGeometry.width','Track width','m',.01,'Width of each track belt. Affects the visible belt and contact footprint.'),
   num('trackGeometry.radius','Track end radius','m',.005,'Radius of rounded track ends. Affects belt shape and ground clearance.'),
   num('trackGeometry.samples','Contact samples','',1,'Number of ground samples along each track, from 3 to 9. More samples improve terrain following at greater physics cost.'),
   num('trackGeometry.lateralResistance','Track lateral resistance','',.5,'Resistance to sideways track slip. Higher values reduce sliding but make skid turns harder.'),
  ]},
 ]},
 {title:'SITL settings',className:'pe-sitl',fields:[
  {path:'@sitl',label:'Default parameters',type:'sitl',help:'ArduPilot parameters loaded at the next SITL start. Saved SITL EEPROM values take precedence over these defaults. Use one parameter name and value per line.'}
 ]}
];
export const ALL_FIELDS=SECTIONS.flatMap(s=>[...s.fields,...(s.groups??[]).flatMap(g=>g.fields)]);
