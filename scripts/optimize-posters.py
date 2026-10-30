"""Encode local posters as WebP without changing composition or aspect ratio."""
import json,pathlib
from PIL import Image
R=pathlib.Path(__file__).resolve().parents[1];converted={};saved=0
for name in ['catalog.json','papich-series.json','taste-seeds.json','personal-candidates.json']:
 p=R/'dist'/name;d=json.load(open(p));rows=d['items']if isinstance(d,dict)else d
 for i in rows:
  img=i.get('image')
  if not img or not img.startswith('assets/')or not img.endswith(('.jpg','.jpeg','.png')):continue
  src=R/'dist'/img;dest=src.with_suffix('.webp')
  if img not in converted:
   im=Image.open(src).convert('RGB');im.thumbnail((320,480),Image.Resampling.LANCZOS);im.save(dest,'WEBP',quality=58,method=6);converted[img]=str(dest.relative_to(R/'dist'));saved+=src.stat().st_size-dest.stat().st_size
  i['image']=converted[img]
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2 if name!='personal-candidates.json'else None)+'\n')
print('posters converted:',len(converted),'bytes saved:',saved)
