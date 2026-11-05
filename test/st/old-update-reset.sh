#!/bin/bash
# 演练前后复位：删掉演练写出的新预设与合并前备份，把它们从酒馆助手 / 正则放行名单里拿掉
P="/workspace/st-test/SillyTavern/data/default-user/OpenAI Settings"
ls "$P" | grep -E "^kami-v0\.93-1-20261104|合并前备份" | while read f; do rm -v "$P/$f"; done
python3 -I - <<'PY'
import json
f='/workspace/st-test/SillyTavern/data/default-user/settings.json'
s=json.load(open(f))
def clean(lst): return [x for x in lst if not (x.startswith('kami-v0.93-1-20261104') or '合并前备份' in x)]
sc=s['extension_settings']['tavern_helper']['script']
for k in ('enabled','popuped'): sc[k]['presets']=clean(sc[k]['presets'])
ex=s['extension_settings']
for k in list(ex.keys()):
    pass
# 正则放行名单（字段名见 install-preset.mjs）
for key in ('preset_allowed_regex',):
    v=ex.get(key)
    if isinstance(v,dict):
        for kk in v: 
            if isinstance(v[kk],list): v[kk]=clean(v[kk])
json.dump(s,open(f,'w'),ensure_ascii=False,indent=4)
print('settings 已清理')
PY
