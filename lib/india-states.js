/* ============================================================
   lib/india-states.js — lead ka state

   Pehle form me likha state (sahi naam me badal ke — "UP" → Uttar
   Pradesh), na ho to city se state (Jaipur → Rajasthan). Dono na hon
   to khaali — andaaza nahi lagate.
   ============================================================ */

export const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

const ALIAS = {
  up: "Uttar Pradesh", "u.p": "Uttar Pradesh", "u p": "Uttar Pradesh", mp: "Madhya Pradesh", "m.p": "Madhya Pradesh",
  hp: "Himachal Pradesh", ap: "Andhra Pradesh", tn: "Tamil Nadu", wb: "West Bengal", jk: "Jammu and Kashmir",
  "j&k": "Jammu and Kashmir", "jammu & kashmir": "Jammu and Kashmir", uk: "Uttarakhand", uttaranchal: "Uttarakhand",
  orissa: "Odisha", pondicherry: "Puducherry", "new delhi": "Delhi", "delhi ncr": "Delhi", ncr: "Delhi", "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi", mh: "Maharashtra", rj: "Rajasthan", gj: "Gujarat", hr: "Haryana",
  pb: "Punjab", ka: "Karnataka", kl: "Kerala", ts: "Telangana", cg: "Chhattisgarh", chattisgarh: "Chhattisgarh",
  jh: "Jharkhand", br: "Bihar", "andaman": "Andaman and Nicobar Islands", "daman": "Dadra and Nagar Haveli and Daman and Diu",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  /* Hindi */
  "उत्तर प्रदेश": "Uttar Pradesh", "राजस्थान": "Rajasthan", "मध्य प्रदेश": "Madhya Pradesh", "बिहार": "Bihar",
  "महाराष्ट्र": "Maharashtra", "दिल्ली": "Delhi", "हरियाणा": "Haryana", "पंजाब": "Punjab", "गुजरात": "Gujarat",
  "उत्तराखंड": "Uttarakhand", "झारखंड": "Jharkhand", "छत्तीसगढ़": "Chhattisgarh", "हिमाचल प्रदेश": "Himachal Pradesh",
  "पश्चिम बंगाल": "West Bengal", "ओडिशा": "Odisha", "असम": "Assam",
};

const CITY = {
  "Rajasthan": "jaipur jodhpur udaipur kota ajmer bikaner alwar bhilwara sikar bharatpur sri ganganagar ganganagar pali barmer jhunjhunu churu nagaur tonk chittorgarh hanumangarh dausa beawar kishangarh",
  "Uttar Pradesh": "lucknow kanpur agra varanasi banaras prayagraj allahabad meerut ghaziabad noida greater noida aligarh bareilly moradabad gorakhpur saharanpur jhansi mathura firozabad ayodhya faizabad muzaffarnagar shahjahanpur rampur etawah mirzapur bulandshahr hapur sitapur unnao rae bareli raebareli azamgarh ballia basti gonda deoria jaunpur sultanpur hardoi lakhimpur pilibhit budaun badaun mainpuri etah kannauj fatehpur banda hamirpur lalitpur orai jalaun",
  "Madhya Pradesh": "bhopal indore gwalior jabalpur ujjain sagar dewas satna ratlam rewa katni singrauli burhanpur khandwa morena bhind chhindwara guna shivpuri vidisha damoh mandsaur neemuch hoshangabad narmadapuram itarsi sehore betul seoni datia",
  "Maharashtra": "mumbai pune nagpur thane nashik aurangabad chhatrapati sambhajinagar solapur kolhapur amravati navi mumbai kalyan vasai virar nanded sangli jalgaon akola latur dhule ahmednagar ahilyanagar chandrapur parbhani jalna bhiwandi panvel satara ratnagiri wardha yavatmal beed osmanabad dharashiv gondia",
  "Delhi": "delhi new delhi dwarka rohini saket janakpuri laxmi nagar karol bagh",
  "Haryana": "gurgaon gurugram faridabad panipat ambala yamunanagar rohtak hisar karnal sonipat panchkula bhiwani sirsa bahadurgarh jind thanesar kurukshetra kaithal rewari palwal",
  "Punjab": "ludhiana amritsar jalandhar patiala bathinda mohali sas nagar hoshiarpur pathankot moga batala abohar malerkotla khanna phagwara muktsar barnala rajpura firozpur kapurthala",
  "Gujarat": "ahmedabad surat vadodara baroda rajkot bhavnagar jamnagar junagadh gandhinagar anand navsari morbi nadiad surendranagar bharuch mehsana bhuj porbandar palanpur valsad vapi godhra",
  "Bihar": "patna gaya bhagalpur muzaffarpur purnia darbhanga bihar sharif arrah begusarai katihar munger chhapra danapur saharsa sasaram hajipur dehri siwan motihari nawada bettiah",
  "Jharkhand": "ranchi jamshedpur dhanbad bokaro deoghar phusro hazaribagh giridih ramgarh medininagar chirkunda",
  "West Bengal": "kolkata calcutta howrah durgapur asansol siliguri bardhaman burdwan malda baharampur habra kharagpur shantipur dankuni dhulian ranaghat haldia raiganj krishnanagar nabadwip medinipur jalpaiguri balurghat bankura darjeeling",
  "Odisha": "bhubaneswar cuttack rourkela berhampur brahmapur sambalpur puri balasore baleshwar bhadrak baripada jharsuguda jeypore",
  "Telangana": "hyderabad secunderabad warangal nizamabad karimnagar khammam ramagundam mahbubnagar nalgonda adilabad suryapet siddipet",
  "Andhra Pradesh": "visakhapatnam vizag vijayawada guntur nellore kurnool rajahmundry rajamahendravaram tirupati kakinada kadapa anantapur eluru ongole vizianagaram machilipatnam amaravati",
  "Karnataka": "bangalore bengaluru mysore mysuru hubli hubballi dharwad mangalore mangaluru belgaum belagavi gulbarga kalaburagi davanagere bellary ballari vijayapura bijapur shimoga shivamogga tumkur tumakuru raichur bidar udupi hassan",
  "Tamil Nadu": "chennai madras coimbatore madurai tiruchirappalli trichy salem tirunelveli tiruppur vellore erode thoothukudi tuticorin dindigul thanjavur hosur nagercoil kanchipuram karur",
  "Kerala": "thiruvananthapuram trivandrum kochi cochin ernakulam kozhikode calicut thrissur kollam kannur alappuzha palakkad malappuram kottayam",
  "Uttarakhand": "dehradun haridwar roorkee haldwani rudrapur kashipur rishikesh nainital",
  "Himachal Pradesh": "shimla mandi solan dharamshala kullu manali baddi",
  "Chhattisgarh": "raipur bhilai durg bilaspur korba rajnandgaon raigarh jagdalpur ambikapur",
  "Assam": "guwahati silchar dibrugarh jorhat nagaon tinsukia tezpur",
  "Jammu and Kashmir": "srinagar jammu anantnag baramulla udhampur kathua",
  "Goa": "panaji panjim margao vasco da gama mapusa",
  "Chandigarh": "chandigarh",
  "Puducherry": "puducherry pondicherry karaikal",
  "Tripura": "agartala",
  "Meghalaya": "shillong",
  "Manipur": "imphal",
  "Nagaland": "kohima dimapur",
  "Mizoram": "aizawl",
  "Sikkim": "gangtok",
  "Arunachal Pradesh": "itanagar",
  "Ladakh": "leh kargil",
};
/* Lambe naam pehle ("navi mumbai" "mumbai" se pehle) */
const CITY_LIST = Object.entries(CITY)
  .flatMap(([st, list]) => {
    const words = list.split(" "); const out = []; const multi = ["new delhi", "navi mumbai", "greater noida", "rae bareli", "sri ganganagar", "chhatrapati sambhajinagar", "vasco da gama", "bihar sharif", "sas nagar"];
    multi.forEach((m) => { if (list.includes(m)) out.push([m, st]); });
    words.forEach((w) => { if (w.length > 2) out.push([w, st]); });
    return out;
  })
  .sort((a, b) => b[0].length - a[0].length);

const clean = (s) => String(s || "").trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}&.\s]/gu, " ").replace(/\s+/g, " ").trim();

/* Form me likha state → sahi naam */
export function normalizeState(raw) {
  const s = clean(raw);
  if (!s) return "";
  if (ALIAS[s]) return ALIAS[s];
  const hit = STATES.find((x) => x.toLowerCase() === s);
  if (hit) return hit;
  const part = STATES.find((x) => s.includes(x.toLowerCase()));
  if (part) return part;
  const al = Object.keys(ALIAS).find((k) => k.length > 3 && s.includes(k));
  return al ? ALIAS[al] : "";
}

/* City → state */
export function stateFromCity(raw) {
  const s = ` ${clean(raw)} `;
  if (!s.trim()) return "";
  const hit = CITY_LIST.find(([c]) => s.includes(` ${c} `));
  return hit ? hit[1] : (normalizeState(raw) || "");
}

/* Lead ka state + kahan se pata chala */
export function leadState(r) {
  const f = normalizeState(r?.state);
  if (f) return { state: f, via: "form" };
  const c = stateFromCity(r?.city);
  if (c) return { state: c, via: "city" };
  return { state: "", via: "" };
}
