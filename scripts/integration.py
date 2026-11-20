#!/usr/bin/env python3
"""Real ArduRover integration, isolated subprocesses/ports. Needs pymavlink."""
import argparse, json, math, os, pathlib, subprocess, tempfile, time, urllib.request
from pymavlink import mavutil
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--sitl',required=True);p.add_argument('--output',default=str(ROOT/'docs/integration-result.json'));args=p.parse_args()

def state():
    with urllib.request.urlopen('http://127.0.0.1:8091/api/state',timeout=2) as r:return json.load(r)

def wait_for(fn,timeout=20):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        try:
            value=fn()
            if value:return value
        except (OSError,ValueError):pass
        time.sleep(.1)
    raise TimeoutError(f'condition after {timeout}s')

with tempfile.TemporaryDirectory(prefix='rover-sitl-') as run:
    run=pathlib.Path(run);c=json.loads((ROOT/'config/default.json').read_text());c.update(httpPort=8091,udpPort=9003)
    (run/'config.json').write_text(json.dumps(c));logs=[];procs=[];results={}
    try:
        for name,cmd,cwd in [
          ('backend',['node',str(ROOT/'src/server.js'),'--flat','--config',str(run/'config.json')],ROOT),
          ('sitl',[str(pathlib.Path(args.sitl).resolve()),'--model','JSON:127.0.0.1','--sim-port-out','9003','--rate','100','--speedup','1','--home','50.4501,30.5234,100,0','--defaults',str(ROOT/'config/rover.parm'),'--serial0','tcp:5770','--serial1','tcp:5772','--wipe'],run)]:
            log=open(run/f'{name}.log','w+');logs.append((name,log));procs.append(subprocess.Popen(cmd,cwd=cwd,stdout=log,stderr=subprocess.STDOUT))
        wait_for(lambda:state()['connected'],40)
        link=mavutil.mavlink_connection('tcp:127.0.0.1:5770',source_system=255)
        assert link.wait_heartbeat(timeout=20),'heartbeat missing'
        results['heartbeat']=True
        link.mav.request_data_stream_send(1,1,mavutil.mavlink.MAV_DATA_STREAM_ALL,10,1)
        second=mavutil.mavlink_connection('tcp:127.0.0.1:5772',source_system=254)
        assert second.wait_heartbeat(timeout=15),'second simultaneous endpoint missing'
        results['simultaneous_mavlink_endpoints']=True
        def pump(seconds,rc=None):
            end=time.monotonic()+seconds
            while time.monotonic()<end:
                link.mav.heartbeat_send(mavutil.mavlink.MAV_TYPE_GCS,mavutil.mavlink.MAV_AUTOPILOT_INVALID,0,0,0)
                if rc:link.mav.rc_channels_override_send(1,1,rc[0],65535,rc[1],65535,65535,65535,65535,65535)
                msg=link.recv_match(blocking=True,timeout=.05)
                if msg and msg.get_type()=='STATUSTEXT':print(msg.text,flush=True)
        def param(name,value):
            link.mav.param_set_send(1,1,name.encode(),value,mavutil.mavlink.MAV_PARAM_TYPE_REAL32)
            end=time.monotonic()+3
            while time.monotonic()<end:
                m=link.recv_match(type='PARAM_VALUE',blocking=True,timeout=.2)
                if m and m.param_id==name:return m.param_value
            raise TimeoutError(name)
        pump(10,(1500,1500))
        ready=False;deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            pump(.25,(1500,1500))
            ekf=link.recv_match(type='EKF_STATUS_REPORT',blocking=True,timeout=.5)
            if ekf and ekf.flags&16:
                ready=True;break
        assert ready,'EKF absolute horizontal position not ready'
        results['ekf_absolute_position']=True
        stationary=state();results['stationary_accel']=stationary['sensor']['imu']['accel_body'];assert abs(results['stationary_accel'][2]+9.80665)<.2
        link.set_mode('MANUAL');pump(1,(1500,1500))
        link.mav.command_long_send(1,1,mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,0,1,0,0,0,0,0,0)
        pump(3,(1500,1500))
        hb=link.recv_match(type='HEARTBEAT',blocking=True,timeout=3)
        if not hb or not hb.base_mode&mavutil.mavlink.MAV_MODE_FLAG_SAFETY_ARMED:
            raise AssertionError('normal arming failed; inspect prearm messages')
        origin=state()['position'];pump(3,(1500,1700));forward=state();results['forward_metres']=forward['position']['x']-origin['x'];assert results['forward_metres']>.4
        pump(2,(1500,1500));start=state()['position'];pump(3,(1500,1300));reverse=state();results['reverse_metres']=reverse['position']['x']-start['x'];assert results['reverse_metres']<-.3
        pump(2,(1500,1500));heading=state()['heading'];pump(2,(1750,1650));turned=state();results['right_turn_deg']=(turned['heading']-heading+180)%360-180;assert results['right_turn_deg']>5
        pump(2,(1500,1500))
        # Upload one waypoint ahead of the present GPS position; AUTO must move and reach it.
        gps=link.recv_match(type='GLOBAL_POSITION_INT',blocking=True,timeout=5);assert gps
        heading=state()['heading']*math.pi/180
        north,east=4*math.cos(heading),4*math.sin(heading)
        lat=gps.lat/1e7+north/111319.5;lon=gps.lon/1e7+east/(111319.5*math.cos(gps.lat/1e7*math.pi/180))
        link.mav.mission_clear_all_send(1,1)
        clear_ack=link.recv_match(type='MISSION_ACK',blocking=True,timeout=3);assert clear_ack and clear_ack.type==0
        link.mav.mission_count_send(1,1,2)
        reached=False;end=time.monotonic()+15
        while time.monotonic()<end:
            msg=link.recv_match(blocking=True,timeout=.2)
            if not msg:continue
            if msg.get_type() in ('MISSION_REQUEST','MISSION_REQUEST_INT'):
                seq=msg.seq;la=gps.lat/1e7 if seq==0 else lat;lo=gps.lon/1e7 if seq==0 else lon
                link.mav.mission_item_int_send(1,1,seq,mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,mavutil.mavlink.MAV_CMD_NAV_WAYPOINT,0,1,0,.5,0,0,int(la*1e7),int(lo*1e7),0)
            elif msg.get_type()=='MISSION_ACK':assert msg.type==0;results['mission_uploaded']=True;break
        else:raise TimeoutError('mission upload')
        link.mav.rc_channels_override_send(1,1,0,0,0,0,0,0,0,0)
        link.mav.mission_set_current_send(1,1,1);link.set_mode('AUTO')
        end=time.monotonic()+40;mission_start=state()['position']
        while time.monotonic()<end:
            link.mav.heartbeat_send(mavutil.mavlink.MAV_TYPE_GCS,mavutil.mavlink.MAV_AUTOPILOT_INVALID,0,0,0)
            msg=link.recv_match(blocking=True,timeout=.2)
            if msg and msg.get_type()=='STATUSTEXT':print(msg.text,flush=True)
            if msg and msg.get_type()=='MISSION_ITEM_REACHED' and msg.seq==1:reached=True;break
        results['mission_item_reached']=reached;results['mission_final_state']=state()['position'];assert reached,'AUTO waypoint not reached'
        # Restart the actual firmware after timeout; backend must reset its world
        # and reconnect without any browser, not just recognise synthetic packets.
        prior_restarts=state()['stats']['restarts']
        link.close();second.close()
        sitl_process=procs[-1];sitl_process.terminate();sitl_process.wait(timeout=5)
        wait_for(lambda:not state()['connected'],5)
        procs.append(subprocess.Popen(sitl_process.args,cwd=run,stdout=logs[-1][1],stderr=subprocess.STDOUT))
        wait_for(lambda:state()['connected'] and state()['stats']['restarts']>prior_restarts,15)
        restarted=state();assert abs(restarted['position']['x'])<.01 and abs(restarted['position']['z'])<.01
        results['real_sitl_restart_reconnected']=True
        results['passed']=True;print(json.dumps(results,indent=2))
    finally:
        for proc in procs:proc.terminate()
        for proc in procs:
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:proc.kill()
        for name,log in logs:
            log.seek(0);text=log.read();(ROOT/'docs'/f'integration-{name}.log').write_text(text);log.close()
        pathlib.Path(args.output).write_text(json.dumps(results,indent=2)+'\n')
