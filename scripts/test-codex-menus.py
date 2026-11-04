#!/usr/bin/env python3
"""Test packaged Codex menus in a disposable Xvfb display and fake Codex profile."""
import json, os, pathlib, socket, subprocess, tempfile, time, urllib.request
app=pathlib.Path(__file__).resolve().parent.parent / 'dist/Capri-0.5.1.AppImage'
with tempfile.TemporaryDirectory(prefix='capri-codex-menu-') as temp:
 p=pathlib.Path(temp); (p/'profile').mkdir(); (p/'bin').mkdir(); (p/'codex').mkdir()
 (p/'profile'/'config.json').write_text(json.dumps({'assistant':'claude','claude':False,'provider':'ollama','lang':'th','welcomed':True,'motionAsked':True,'wander':False,'pcReact':False,'jealous':False}))
 fake=p/'bin'/'codex';fake.write_text('#!/bin/sh\nif [ "$1" = "--version" ] || [ "$1" = "login" ]; then echo ready; exit 0; fi\ncat >/dev/null\nprintf \'%s\\n\' \'{"type":"item.completed","item":{"type":"agent_message","text":"ทดสอบ Codex สำเร็จ"}}\' \'{"type":"turn.completed"}\'\n');fake.chmod(0o755)
 with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 log=open(p/'run.log','w+')
 xvfb=subprocess.Popen(['Xvfb','-displayfd','1','-screen','0','1366x768x24','-ac'],stdout=subprocess.PIPE,stderr=log,text=True)
 display=xvfb.stdout.readline().strip();assert display.isdigit()
 env={**os.environ,'DISPLAY':':'+display,'XDG_SESSION_TYPE':'x11','CAPRI_PORT':str(port),'CODEX_HOME':str(p/'codex'),'PATH':str(p/'bin')+os.pathsep+os.environ['PATH']};env.pop('WAYLAND_DISPLAY',None)
 cmd=[str(app),'--appimage-extract-and-run','--dev','--ozone-platform=x11','--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+str(p/'profile')]
 process=subprocess.Popen(cmd,env=env,stdout=log,stderr=log)
 def call(route,data):
  req=urllib.request.Request(f'http://127.0.0.1:{port}/debug/{route}',json.dumps(data).encode(),{'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=10) as res:return json.load(res)
 def ev(js):return call('eval',{'js':js}).get('value')
 def until(test,seconds=90):
  end=time.monotonic()+seconds
  while time.monotonic()<end:
   try:
    if test():return
   except (OSError,KeyError):pass
   time.sleep(.2)
  raise AssertionError('timeout')
 try:
  until(lambda:ev('Boolean(window.dev)'))
  result=call('menu',{'click':'Codex CLI (ตอบแชต)'});assert result['ok']
  until(lambda:ev('host.getConfig().then(c=>c.provider === "codex")'))
  status=ev('host.chatStatus()');assert status['ok'] and status['provider']=='codex',status
  cfg=ev('host.getConfig()');assert cfg['assistant']=='claude' and not cfg['claude'],cfg
  print('PASS choose Codex chat without enabling watch',flush=True)
  result=call('menu',{'click':'Codex'});assert result['ok']
  until(lambda:ev('host.getConfig().then(c=>c.assistant === "codex" && c.claude)'))
  cfg=ev('host.getConfig()');assert cfg['provider']=='codex'
  print('PASS enable Codex watch while retaining Codex chat',flush=True)
  result=ev('host.chatSend({id:"test",messages:[{role:"user",content:"hello"}]})');assert result['ok'] and result['text']=='ทดสอบ Codex สำเร็จ',result
  print('PASS packaged UI routes chat through Codex provider',flush=True)
  assert not (p/'codex'/'hooks.json').exists()
  print('PASS choosing watch did not install hooks without user action',flush=True)
  installed=ev('host.installHooks()');assert installed['ok'],installed
  hook=p/'profile'/'codex-hooks'/'capri-codex-hook.js'
  config=json.loads((p/'codex'/'hooks.json').read_text())
  assert hook.exists() and str(hook) in config['hooks']['Stop'][0]['hooks'][0]['command']
  print('PASS packaged installation uses durable hook in application profile',flush=True)
 except Exception:
  log.flush();log.seek(0);print(log.read()[-3000:]);raise
 finally:
  process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:process.kill();process.wait()
  xvfb.terminate();xvfb.wait(timeout=10);log.close()
