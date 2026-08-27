const API='http://127.0.0.1:4199';
const get=async(p)=>{const r=await fetch(API+p);const t=await r.text();try{return JSON.parse(t)}catch{return t}};
const arr=(x)=>Array.isArray(x)?x:(x&&x.items)||[];
(async()=>{
  const cols=['sites','zones','articles','inventory','loc_status','disabled','mov_log','quarantine','pending_outbound','pick_session','pick_archive','disposal_archive','operators','meta','lots','udc','tasks','wip','storage_rules','recipients'];
  for(const c of cols) console.log(c.padEnd(18), JSON.stringify(await get(`/api/c/${c}/count`)));
  console.log('\n=== ZONE ===');
  for(const z of arr(await get('/api/c/zones')))
    console.log(`${z.site_id}/${z.id} "${z.name}" tipo=${z.type} attiva=${z.active} temp=${z.temp_class||'-'} allerg=${z.allergen_zone??'-'} peric=${z.hazard_zone??'-'} refr=${z.refrigerated??'-'} lvl=${z.levels} corsie=${z.aisles} campate=${z.bays_per_aisle} righe=${z.rows} pos=${z.positions_per_row||z.positions}`);
  console.log('\n=== STORAGE RULES ===');
  console.log(JSON.stringify(arr(await get('/api/c/storage_rules')),null,1));
  console.log('\n=== WIP ===');
  console.log(JSON.stringify(arr(await get('/api/c/wip')),null,1));
  console.log('\n=== UDC ===');
  console.log(JSON.stringify(arr(await get('/api/c/udc')),null,1));
})();
