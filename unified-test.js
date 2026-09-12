/* =========================================================
   UNIFIED INTERACTIVE TEST ENGINE
   ========================================================= */

const ALL_TESTS = {
  "1032": {
    id: "1032",
    title: "Ethics in the Workplace",
    text: `Ethical employees are those who make decisions in the best interest of their employers, co-workers and outside stakeholders in addition to themselves. Workplace ethics centre on such diverse issues as discrimination, fraud, theft and harassment. Although all people are intrinsically valuable, ethical employees can actually be more financially valuable to their employers, and more valued by co-workers and peers.

Understanding how ethics can make you a better person in the workplace is a solid starting point for a commitment to always doing the right thing. Therefore, gaining the trust of your co-workers can enhance your productivity by making it easier for you to communicate and work with others in the workplace.

Employees who spread distrust can meet resistance when seeking help from others, but trusted co-workers can always find a helping hand. Gaining the trust of their managers can open doors to workers for new responsibilities at work, possibly leading to promotions and pay raise.

Adapted from https://smallbusiness.chron.com/ethics-`,
    dictionary: {
      "Employees":"الموظفون","Interest":"الفائدة","Employers":"المدراء","Co-workers":"زملاء العمل",
      "Stakeholders":"أصحاب المصلحة أو المعنيين في المؤسسة","Discrimination":"التمييز","Fraud":"الاحتيال",
      "Theft":"السرقة","Harassment":"التحرش","Valuable":"ذو قيمة","Trust":"الثقة","Productivity":"الإنتاجية",
      "Enhance":"تعزيز","Communicate":"التواصل","Promotions":"الترقية المهنية","Pay raise":"زيادة في الرواتب"
    },
    quizData: [
      {
        type: "mcq-group",
        title: "1. Choose the answer to complete each statement.",
        questions: [
          {id:"1a", text:"a) Ethical workers are those who improve …….", options:["their profits","human relationships","the number of stakeholders"]},
          {id:"1b", text:"b) Workplace can be exposed to …………….", options:["unethical practices","unfair competition","regular audits"]},
          {id:"1c", text:"c) Lack of confidence between workers ……..", options:["saves time and money","encourages human contact","affects work quality"]}
        ]
      },
      {
        type: "ordering",
        title: "2. Put the following ideas in the order they appear in the text.",
        items: [
          {id:"2a", text:"a) Mutual trust is important for cooperation at work."},
          {id:"2b", text:"b) Workplace code of conduct is concerned with unethical behaviours."},
          {id:"2c", text:"c) Ethical employees contribute more to their employers’ wealth."}
        ]
      },
      {
        type: "text-group",
        title: "3. Answer the following questions according to the text.",
        questions: [
          {id:"3a", text:"a) What unethical practices do workplace ethics focus on?"},
          {id:"3b", text:"b) Why is it important to trust your workmates?"},
          {id:"3c", text:"c) Is confidence between employees and employers fruitful? Justify your answer."}
        ]
      },
      {
        type: "mcq-single",
        title: "4. Choose the most appropriate title",
        options: ["a) Decision making in companies.","b) Productivity factors in business.","c) Ethics at the workplace."]
      }
    ],
    answers: {
      "1a":"human relationships","1b":"unethical practices","1c":"affects work quality",
      order:{"2b":1,"2c":2,"2a":3},
      "3a":["discrimination","fraud","theft","harassment"],
      "3b":["productivity","communicate","easier"],
      "3c":["yes","promotions","pay raise"],
      "4":"c) Ethics at the workplace."
    }
  },

  "1033": {
    id: "1033",
    title: "Corruption in the Health Sector",
    text: `Corruption in the health sector can mean the difference between life and death. Poor people are the most affected. Medical staff can charge unofficial fees to attend to patients. They may demand bribes for medication which should be free. Corruption also costs lives when fake adulterated medications are sold to health services.

Without governmental control, public funds can easily disappear. World bank surveys show that in some countries up to 80 percent of non-salary health funds never reach local facilities. Ministers and hospital administrators who embezzle millions of dollars from health budgets, or accept bribes give bad reputation to qualified medical staff. Stolen funds also hamper efforts to beat major health challenges, such as Malaria and HIV/ AIDS.

Governments need to publish detailed health budgets and financial information to be understood. As a result, we can truck funds and prevent them from being stolen. Health workers need adequate pay and guarantees that salaries will reach them on time. Governments need to tackle counterfeit drugs at source.

At the local level, we all have an important role to play. We must demand accountability from health professionals and administrators. We can scrutinise clinic or hospital budgets. Or make sure we are aware of official charges for free services. We must also demand public consultations over health services, and to ensure equal opportunities

http://www.transparency.org/topic/detail/health`,
    dictionary: {
      "Corruption":"الفساد","Health sector":"القطاع الصحي","Staff":"طاقم العمل","Affected":"متأثر",
      "Unofficial fees":"رسوم غير رسمية","Patients":"المرضى","Adulterated medications":"أدوية المغشوشة",
      "Embezzle":"اختلاس","Budgets":"الميزانيات","Reputation":"السمعة","Qualified":"مؤهل","Stolen":"مسروق",
      "Hamper efforts":"إعاقة الجهود","Publish":"نشر","Track":"تتبع","Adequate pay":"أجر كافٍ",
      "Tackle":"معالجة موضوع","Accountability":"المسؤولية","Scrutinize":"التدقيق في","Aware":"مدرك",
      "Ensure":"ضمان","Equal opportunities":"تكافؤ الفرص"
    },
    quizData: [
      {type:"mcq-single", title:"1. The text is taken from", options:["a: a web site.","b: a book extract.","c: a news paper article."]},
      {type:"tf-group", title:"2. Say whether the statements are true or false.",
        questions:[
          {id:"2a",text:"a. Corruption affects the poor the most."},
          {id:"2b",text:"b. People can be asked for a bribe in order to have health care."},
          {id:"2c",text:"c. Governments can’t fight funds disappearance."},
          {id:"2d",text:"d. We don’t have to know about hospitals budget to ensure good health care."}
        ]},
      {type:"text-group", title:"3. Answer the following questions according to the text.",
        questions:[
          {id:"3a",text:"a. What unethical behaviours are committed by the medical staff?"},
          {id:"3b",text:"b. How can governments fight funds disappearance?"},
          {id:"3c",text:"c. Is it possible for people to improve health services at the local level?"}
        ]},
      {type:"para-match", title:"4. In which paragraph are the following ideas mentioned",
        questions:[
          {id:"4a",text:"a: health workers should be well paid in order to stop bribery."},
          {id:"4b",text:"b: some patient’s families give bribery to treat their relative."}
        ], options:["1","2","3","4"]},
      {type:"text-group", title:"5. What or who do the underlined words refer to in the text?",
        questions:[
          {id:"5a",text:"a) who (§2) ………"},
          {id:"5b",text:"b) we (§4) ………"}
        ]}
    ],
    answers: {
      "1":"a: a web site.",
      "2a":"True","2b":"True","2c":"False","2d":"False",
      "3a":["unofficial fees","bribes","medication"],
      "3b":["publish","budgets","financial information","truck funds","prevent"],
      "3c":["yes","demand accountability","scrutinise","budgets"],
      "4a":"3",
      "4b":"1",
      "5a":["ministers","administrators"],
      "5b":["people","readers"]
    }
  },

  "1034": {
    id: "1034",
    title: "Ethics in Business",
    text: `In today's competitive world, many companies are under pressure to make profits. However, focusing only on financial success can sometimes lead to unethical behavior. Business ethics is the study of what is right and wrong in the world of commerce. It helps companies act responsibly and fairly.

Ethical businesses consider the impact of their decisions on employees, customers, and the environment. For example, some companies ensure fair wages and safe working conditions for their workers. Others choose not to pollute or exploit natural resources, even if doing so would increase profits.

Unethical practices, such as false advertising, bribery, or using cheap labor in unsafe conditions, can damage a company’s reputation and lead to legal consequences. On the other hand, ethical companies often gain the trust of consumers and build long-term success.

In conclusion, ethics in business is not just about following laws. It is about doing what is right—even when no one is watching. Businesses that make ethical choices contribute positively to society and the economy.

Adapted from Crane, A., & Matten, D. (2016). Business Ethics.`,
    dictionary: {
      "Competitive":"تنافسي","Under pressure":"تحت الضغط","Profits":"الأرباح","Financial success":"النجاح المالي",
      "Commerce":"التجارة","Fairly":"بعدالة","Impact":"الأثر","Employees":"الموظفون","Customers":"العملاء",
      "Ensure fair wages":"ضمان أجور عادلة","Resources":"الموارد","False advertising":"إعلانات مضللة",
      "Cheap labor":"العمالة الرخيصة","Unsafe":"غير آمن","Damage":"الإضرار بـ","Reputation":"السمعة",
      "Trust":"الثقة","Consumers":"المستهلكون","Contribute":"المساهمة في","Society":"المجتمع","Economy":"الاقتصاد"
    },
    quizData: [
      {type:"mcq-single", title:"1. Identify the type of the text.", options:["a) an extract from a book","b) a speech.","c) a web article."]},
      {type:"tf-group", title:"2. Say whether the following sentences are true or false.",
        questions:[
          {id:"2a",text:"a- Business ethics is only about obeying the law."},
          {id:"2b",text:"b- Ethical businesses always put people and the environment first."},
          {id:"2c",text:"c- Companies that act unethically can lose public trust."},
          {id:"2d",text:"d- All successful companies are ethical."}
        ]},
      {type:"text-group", title:"3. Answer the following questions according to the text.",
        questions:[
          {id:"3a",text:"a- What is business ethics?"},
          {id:"3b",text:"b- How do ethical businesses treat workers?"},
          {id:"3c",text:"c- What are some examples of unethical practices?"},
          {id:"3d",text:"d- Why is it important for businesses to act ethically?"}
        ]},
      {type:"mcq-single", title:"4. Choose the general idea of the text.", options:["a- How businesses increase profits","b- Why competition is necessary for business","c- The importance of ethics in business"]},
      {type:"text-group", title:"5. Find what or who the underlined words in the text refer to.",
        questions:[
          {id:"5a",text:"a) it (§1) ………"},
          {id:"5b",text:"b) their (§2) ………"}
        ]}
    ],
    answers: {
      "1":"a) an extract from a book",
      "2a":"False","2b":"True","2c":"True","2d":"False",
      "3a":["study","right","wrong","commerce","responsibly"],
      "3b":["fair wages","safe working conditions","impact"],
      "3c":["false advertising","bribery","cheap labor","unsafe conditions"],
      "3d":["trust","long-term success","society","economy"],
      "4":"c- The importance of ethics in business",
      "5a":["study","business ethics"],
      "5b":["some companies","companies"]
    }
  },

  "1035": {
    id: "1035",
    title: "The Indus Civilization",
    text: `The valley of the Indus River is considered to be the birthplace of the Indus civilization. Located on the Indian subcontinent in modern Pakistan, the Indus civilization was not discovered by archaeologists until 1924. The ancient history of this region is obscured by legend. It appears, however, that by 4000 BC primitive farmers were growing vegetables, grains, and breeding animals along the riverbanks.

There is some evidence that Mesopotamian traders reached the nearly Indian people by sailing from Sumer to the Indus valley. The Indians shared some developments - such as complex irrigation and drainage systems, and the art of writing – with Sumer, they also developed their own system of writing.

The Indus civilization had large cities that were well laid-out and well fortified. There were public buildings, palaces, baths, and large granaries to hold agricultural produce. The many artworks found by archaeologists indicate that the residents of the Indus had reached a fairly high level of culture before their civilization was destroyed.

Adapted from Britannica 2009`,
    dictionary: {
      "River":"نهر","Birthplace":"مكان الميلاد","Located":"يقع في","Archaeologists":"علماء الآثار",
      "Discovered":"اكتشف","Ancient":"قديم","Primitive farmers":"مزارعون بدائيون","Vegetables":"الخضروات",
      "Grains":"الحبوب","Breeding animals":"تربية المواشي","Evidence":"أدلة","Traders":"التجار",
      "Shared":"مشاركة","Complex irrigation":"نظام ري معقد","Drainage systems":"أنظمة الصرف",
      "Fortified":"محصن","Laid out":"مخطط","Palaces":"القصور","Granaries":"مخازن الحبوب",
      "Residents":"السكان","Culture":"الثقافة","Destroyed":"دُمِّر"
    },
    quizData: [
      {type:"tf-group", title:"1. Say whether the following statements are True or False.",
        questions:[
          {id:"1a",text:"a) The Indus civilization was known before 1924."},
          {id:"1b",text:"b) Sailors from Mesopotamia arrived at the Indus valley."},
          {id:"1c",text:"c) The Indus valley cities and towns were well-protected."},
          {id:"1d",text:"d) The Indus people's culture was not very developed."}
        ]},
      {type:"para-match", title:"2. Identify the paragraphs in which the following ideas are mentioned.",
        questions:[
          {id:"2a",text:"a) ancient Indus people relied on agriculture."},
          {id:"2b",text:"b) the Indus left many historical and artistic works."}
        ], options:["1","2","3"]},
      {type:"text-group", title:"3. Answer the following questions according to the text.",
        questions:[
          {id:"3a",text:"a) Where did the Indus civilization rise?"},
          {id:"3b",text:"b) Which inventions did the Indians share with the Sumerians?"},
          {id:"3c",text:"c) Mention two of the Indus civilization achievements."}
        ]},
      {type:"text-group", title:"4. Find who or what the underlined words in the text refer to.",
        questions:[
          {id:"4a",text:"a) this region (§1) ………"},
          {id:"4b",text:"b) they (§2) ………"},
          {id:"4c",text:"c) that (§3) ………"},
          {id:"4d",text:"d) their (§3) ………"}
        ]},
      {type:"text-group", title:"5. Find in the text words or phrases that are opposite in meaning to the following.",
        questions:[
          {id:"5a",text:"a) modern (§1) ≠ ………"},
          {id:"5b",text:"b) simple (§2) ≠ ………"},
          {id:"5c",text:"c) low (§3) ≠ ………"}
        ]}
    ],
    answers: {
      "1a":"False","1b":"True","1c":"True","1d":"False",
      "2a":"1","2b":"3",
      "3a":["indus river","valley","indian subcontinent","modern pakistan"],
      "3b":["irrigation","drainage","writing"],
      "3c":["public buildings","palaces","baths","granaries","artworks"],
      "4a":["indian subcontinent","modern pakistan"],
      "4b":["indians"],
      "4c":["large cities"],
      "4d":["residents","indus"],
      "5a":["ancient"],
      "5b":["complex"],
      "5c":["high"]
    }
  },

  "1036": {
    id: "1036",
    title: "Algeria's UNESCO Heritage",
    text: `Algeria has an impressive history with valuable cultural sites that are internationally acknowledged on UNESCO's Heritage List, with a total of seven recognized sites.

Starting with the Al Qal'a of Ben Hammad, this archaeological site houses the remains of the country's second largest ancient mosque. It has influenced the development of Arab architecture and other civilizing influences in the region. Djemila and Timgad, on the other hand, offer insights into Roman civilization. Djemila is a mountain village with well-preserved Berber-Roman ruins, showcasing a unique adaptation of Roman architecture in a mountain environment, earning its place on UNESCO's list. While Timgad, founded as a military colony by Emperor Trajan, exemplifies Roman town planning and represents the grandeur of Rome in Numidian soil.

Additionally, the Casbah of Algiers and the M’Zab Valley represent the unique architectural and cultural heritage of Algeria. The Casbah is known for its fascinating labyrinth and blend of modernization and old-world charm, featuring a wealth of French colonial buildings and Ottoman grandeur. The M'Zab Valley and Ghardaia, located in the Sahara, are UNESCO World Heritage Sites that preserve rich culture, history, and tradition for over a thousand years.

Lastly, Tipaza, along the Mediterranean coast, is an important archaeological site that bears exceptional testimony to the Punic and also to the Roman civilizations. Meanwhile, Tassili n'Ajjer, a vast plateau in southeast Algeria, is a remarkable treasure trove of prehistoric art, with over 15,000 engravings and paintings.

Adapted from UNESCO's and Mosaic North Africa's websites`,
    dictionary: {
      "Impressive":"مذهل","Valuable":"ذو قيمة","Cultural sites":"مواقع ثقافية","Acknowledged":"معترف به",
      "Recognized sites":"مواقع معتمدة","Remains":"بقايا","Ancient mosque":"مسجد قديم","Architecture":"الهندسة المعمارية",
      "Influenced":"أثر على","Mountain":"جبل","Well-preserved":"محفوظ بشكل جيد","Ruins":"أنقاض",
      "Unique adaptation":"تكيف فريد","Earning":"اكتساب","Founded":"تأسست","Military colony":"مستعمرة عسكرية",
      "Heritage":"التراث","Fascinating labyrinth":"متاهة ساحرة","Preserve":"الحفاظ على","Exceptional":"استثنائي",
      "Testimony":"شهادة","Treasure":"كنز","Engravings":"النقوش","Paintings":"اللوحات","Remarkable":"رائع"
    },
    quizData: [
      {type:"mcq-single", title:"1. Identify the type of the text.", options:["a) narrative.","b) expository.","c) argumentative."]},
      {type:"tf-group", title:"2. Say whether the following statements are true or false.",
        questions:[
          {id:"2a",text:"a. Algeria's history is unknown to the world."},
          {id:"2b",text:"b. Djemila's Roman-style buildings are on mountains."},
          {id:"2c",text:"c. The Casbah of Algiers has a mix of old and new styles."},
          {id:"2d",text:"d. The M'Zab Valley and Ghardaia are only a few years old."}
        ]},
      {type:"text-group", title:"3. Answer the following questions according to the text.",
        questions:[
          {id:"3a",text:"a. How many sites in Algeria are recognized by UNESCO?"},
          {id:"3b",text:"b. What specific features of Djemila ruins earned them a place on UNESCO's list?"},
          {id:"3c",text:"c. Which sites have historical connections to Roman civilization?"}
        ]},
      {type:"text-group", title:"4. Find what or who the underlined words in the text refer to.",
        questions:[
          {id:"4a",text:"a. this archaeological site (§2) ………"},
          {id:"4b",text:"b. its (§2) ………"}
        ]},
      {type:"text-group", title:"5. Find in the text words or phrases that are closest / opposite in meaning to the following.",
        questions:[
          {id:"5a",text:"a. old (§2) (closest) = ………"},
          {id:"5b",text:"b. situated (§3) (closest) = ………"},
          {id:"5c",text:"c. losing (§2) (opposite) ≠ ………"},
          {id:"5d",text:"d. poor (§3) (opposite) ≠ ………"}
        ]}
    ],
    answers: {
      "1":"b) expository.",
      "2a":"False","2b":"True","2c":"True","2d":"False",
      "3a":["seven","7"],
      "3b":["mountain village","berber-roman ruins","adaptation","mountain environment"],
      "3c":["djemila","timgad","tipaza"],
      "4a":["al qal'a","ben hammad"],
      "4b":["djemila"],
      "5a":["ancient"],
      "5b":["located"],
      "5c":["earning"],
      "5d":["rich"]
    }
  },

  "1037": {
    id: "1037",
    title: "Ancient Civilizations",
    text: `The civilizations of the past whether they developed in Asia and in Africa or in Europe and South America had many features in common. They all shared aspects which historians today are trying to uncover and bring to our knowledge. No matter the geographical distance and centuries separating them, their study reveals that there are important areas where their similarity is striking and the gap holding them apart is quite narrow.

When we look at the Egyptians, the Chinese, the Babylonians, the Incas and the Greeks, we realize that none of them succeeded to become prosperous until they had laid the basis for the existence of a powerful state that imposed order and law both inside their countries and outside their borders.

They also formed well-organised armies that protected them from potential invaders and helped them to conquer other lands in order to widen their sources of income and establish their authority. The other element that was present in each of those glorious nations was the development of trade either at the local level or even in the frame involving foreign communities.

We notice, too, that the civilizations of the past made slavery a practice that was not only tolerated but also legalised. It was the same attitude as regards social inequality which was often considered as a reality belonging to the natural order of things against no solution was possible. Besides, immense efforts were devoted for the erection of gigantic constructions, which in addition to satisfy practical aims, were expected to perpetuate the memory and the glory of the rulers who were eager to defy time and immortalise their names.`,
    dictionary: {
      "Features":"ميزات","In common":"مشترك","Aspects":"جوانب","Historians":"المؤرخون","Uncover":"كشف",
      "Reveals":"يكشف عن","Similarity":"تشابه","Striking":"مذهل","Gap":"الفجوة","Prosperous":"مزدهر",
      "Powerful state":"دولة قوية","Imposed":"مفروض","Armies":"الجيوش","Conquer":"غزو","Invaders":"الغزاة",
      "Authority":"السلطة","Trade":"التجارة","Slavery":"العبودية","Social inequality":"التفاوت الاجتماعي",
      "Rulers":"الحكام","Perpetuate":"تخليد","Immortalize":"تخليد ذكرى"
    },
    quizData: [
      {type:"text-group", title:"1. Answer the following questions according to the text.",
        questions:[
          {id:"1a",text:"a) What did ancient civilizations have in common?"},
          {id:"1b",text:"b) What was necessary for a civilization to become prosperous?"},
          {id:"1c",text:"c) What role did armies play?"},
          {id:"1d",text:"d) What other common elements are mentioned?"}
        ]}
    ],
    answers: {
      "1a":["features","in common","aspects"],
      "1b":["powerful state","order","law"],
      "1c":["protected","invaders","conquer","widen sources"],
      "1d":["trade","slavery","social inequality","erection","gigantic constructions"]
    }
  },

  "1038": {
    id: "1038",
    title: "Ordinary Unethical Behaviour",
    text: `Cheating, deception and other forms of unethical behaviour are widespread in business, sports, schools, and other arenas. While the media focus on extreme cases of cheating, less attention is paid to what researchers call "ordinary unethical behaviour."

Stealing from one’s employer, or cheating on exams are the results of ordinary people surrendering to the temptation to cheat when confronted with the opportunity. These behaviours and others are costly for businesses and society.

Studies find that under some circumstances most people cheat. They don’t cheat as much as they can get away with; rather they cheat up to the point at which they believe they are good. When facing the opportunity to cheat, people experience a conflict between their desire to maintain a positive self-image and to advance their self-interest crossing ethical boundaries. One way to resolve this is to cheat a little, reinterpreting the unethical behaviour as an honest mistake.

Adapted from: ‘ethicalsystems.org’`,
    dictionary: {
      "Cheating":"الغش","Deception":"الخداع","Widespread":"واسع الانتشار","Extreme cases":"حالات قصوى",
      "Ordinary":"عادي","Stealing":"السرقة","Employer":"صاحب العمل","Surrendering":"الاستسلام",
      "Temptation":"الإغراء","Opportunity":"الفرصة","Confronted":"مواجه بـ","Society":"المجتمع",
      "Costly":"مكلف","Circumstances":"الظروف","Conflict":"الصراع","Desire to maintain":"الرغبة في الحفاظ على",
      "Self-interest":"المصلحة الشخصية","Boundaries":"الحدود","Resolve":"حل","Reinterpreting":"إعادة تفسير",
      "Honest mistake":"خطأ غير مقصود"
    },
    quizData: [
      {type:"text-group", title:"1. Answer the following questions.",
        questions:[
          {id:"1a",text:"1. What is ordinary unethical behaviour?"},
          {id:"1b",text:"2. Give examples mentioned in the text."},
          {id:"1c",text:"3. According to the studies, how much do people cheat?"},
          {id:"1d",text:"4. What conflict do people experience?"},
          {id:"1e",text:"5. How do people often resolve this conflict?"}
        ]}
    ],
    answers: {
      "1a":["cheating","deception","unethical behaviour"],
      "1b":["stealing","cheating on exams"],
      "1c":["cheat up to the point","believe they are good"],
      "1d":["conflict","positive self-image","self-interest"],
      "1e":["cheat a little","reinterpreting","honest mistake"]
    }
  }
};

// ========== STATE ==========
let currentTest = null;
let currentStep = 0;
let userAnswers = {};
let studentUsername = "";

// ========== DOM ==========
const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const textOverlay = document.getElementById("text-overlay");
const startBtn = document.getElementById("start-btn");
const usernameInput = document.getElementById("telegram-user");
const testSelect = document.getElementById("test-select");
const closeTextBtn = document.getElementById("close-text-btn");
const textBtn = document.getElementById("text-btn");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const restartBtn = document.getElementById("restart-btn");
const dictOverlay = document.getElementById("dict-modal-overlay");
const dictCloseBtn = document.getElementById("dict-close-btn");
const dictModalText = document.getElementById("dict-modal-text");
const questionContent = document.getElementById("question-content");
const progressMap = document.getElementById("progress-map");
const appContainer = document.querySelector('.app-container');
const pdfBtn = document.getElementById("pdf-btn");

// ========== INIT ==========
function init() {
  testSelect.innerHTML = '<option value="" disabled selected>Choose a test...</option>';
  Object.values(ALL_TESTS).sort((a,b)=>a.id.localeCompare(b.id)).forEach(t=>{
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.title;
    testSelect.appendChild(opt);
  });

  function checkReady(){ startBtn.disabled = !(usernameInput.value.trim() && testSelect.value); }
  usernameInput.addEventListener("input", checkReady);
  testSelect.addEventListener("change", checkReady);

  startBtn.addEventListener("click", startTest);
  closeTextBtn.addEventListener("click", closeTextOverlay);
  textBtn.addEventListener("click", openTextOverlay);
  nextBtn.addEventListener("click", nextQuestion);
  prevBtn.addEventListener("click", prevQuestion);
  restartBtn.addEventListener("click", ()=>{
    resultScreen.classList.remove("active");
    quizScreen.classList.remove("active");
    startScreen.classList.add("active");
    usernameInput.value = "";
    testSelect.value = "";
    startBtn.disabled = true;
  });
  dictCloseBtn.addEventListener("click", ()=>dictOverlay.classList.remove("active"));
  dictOverlay.addEventListener("click", e=>{ if(e.target===dictOverlay) dictOverlay.classList.remove("active"); });
  if(pdfBtn) pdfBtn.addEventListener("click", generatePDF);
}

async function startTest() {
  studentUsername = usernameInput.value.trim();
  if (!studentUsername.startsWith("@")) studentUsername = "@" + studentUsername;
  currentTest = ALL_TESTS[testSelect.value];
  if (!currentTest) return alert("Test not found");

  startBtn.disabled = true;
  startBtn.textContent = "Checking...";

  try {
    const res = await fetch(`/api/check-username?username=${encodeURIComponent(studentUsername)}`);
    const data = await res.json();
    if (!data.valid) {
      alert("Username not found.");
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      return;
    }
  } catch(e){ console.warn("Backend skipped"); }

  startBtn.disabled = false;
  startBtn.textContent = "Continue";
  currentStep = 0;
  userAnswers = {};
  startScreen.classList.remove("active");
  openTextOverlay();
}

function openTextOverlay() {
  if (!currentTest) return;
  document.getElementById("overlay-title").textContent = currentTest.title;
  const paragraphs = currentTest.text.split(/\n\s*\n/).filter(p=>p.trim());
  let html = paragraphs.map(p => `<p>${highlightWords(p.trim(), currentTest.dictionary)}</p>`).join("");
  document.getElementById("overlay-text").innerHTML = html;
  textOverlay.classList.add("active");
  document.querySelectorAll(".dict-word").forEach(el=>{
    el.onclick = () => openDictionary(el.dataset.word);
  });
}

function highlightWords(text, dict) {
  const terms = Object.keys(dict).sort((a,b)=>b.length-a.length);
  let result = text;
  terms.forEach(term=>{
    const regex = new RegExp(`\\b(${escapeRegExp(term)})\\b`,"gi");
    result = result.replace(regex, `<span class="dict-word" data-word="$1">$1</span>`);
  });
  return result;
}
function escapeRegExp(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }

function closeTextOverlay() {
  textOverlay.classList.remove("active");
  quizScreen.classList.add("active");
  buildProgress();
  renderQuestion();
}

function buildProgress() {
  progressMap.innerHTML = "";
  currentTest.quizData.forEach((_,i)=>{
    const dot = document.createElement("div");
    dot.className = "progress-dot" + (i===currentStep ? " active" : "");
    progressMap.appendChild(dot);
  });
}

function renderQuestion() {
  const step = currentTest.quizData[currentStep];
  let html = `<div class="question-title">${step.title}</div>`;

  if (step.type === "mcq-group") {
    step.questions.forEach(q=>{
      html += `<div class="sub-question"><p>${q.text}</p><div class="options-grid">`;
      q.options.forEach(opt=>{
        const sel = userAnswers[q.id]===opt ? "selected" : "";
        html += `<button class="option-btn ${sel}" data-qid="${q.id}" data-value="${opt}">${opt}</button>`;
      });
      html += `</div></div>`;
    });
  }
  else if (step.type === "mcq-single") {
    html += `<div class="options-grid">`;
    step.options.forEach(opt=>{
      const sel = userAnswers["single"+currentStep]===opt ? "selected" : "";
      html += `<button class="option-btn ${sel}" data-qid="single${currentStep}" data-value="${opt}">${opt}</button>`;
    });
    html += `</div>`;
  }
  else if (step.type === "tf-group") {
    step.questions.forEach(q=>{
      html += `<div class="sub-question"><p>${q.text}</p><div class="options-row">`;
      ["True","False"].forEach(val=>{
        const sel = userAnswers[q.id]===val ? "selected" : "";
        html += `<button class="option-btn ${sel}" data-qid="${q.id}" data-value="${val}">${val}</button>`;
      });
      html += `</div></div>`;
    });
  }
  else if (step.type === "para-match") {
    step.questions.forEach(q=>{
      html += `<div class="sub-question"><p>${q.text}</p><div class="options-row">`;
      step.options.forEach(opt=>{
        const sel = userAnswers[q.id]===opt ? "selected" : "";
        html += `<button class="option-btn ${sel}" data-qid="${q.id}" data-value="${opt}">P${opt}</button>`;
      });
      html += `</div></div>`;
    });
  }
  else if (step.type === "ordering") {
    step.items.forEach(item=>{
      const val = userAnswers[item.id] || "–";
      html += `<div class="sub-question" style="display:flex;align-items:center;gap:12px">
        <button class="option-btn" style="width:42px;height:42px;padding:0;text-align:center" data-qid="${item.id}">${val}</button>
        <span>${item.text}</span>
      </div>`;
    });
  }
  else if (step.type === "text-group") {
    step.questions.forEach(q=>{
      const val = userAnswers[q.id] || "";
      html += `<div class="sub-question"><p>${q.text}</p>
        <textarea data-qid="${q.id}" rows="3" placeholder="Type your answer here...">${val}</textarea>
      </div>`;
    });
  }

  questionContent.innerHTML = html;
  questionContent.style.animation = 'none';
  questionContent.offsetHeight;
  questionContent.style.animation = 'slideIn 0.5s ease forwards';
  attachListeners();
  updateNav();
}

function attachListeners() {
  document.querySelectorAll(".option-btn").forEach(btn=>{
    btn.addEventListener("click", e=>{
      const qid = e.target.dataset.qid;
      const value = e.target.dataset.value;

      if (value) { // normal option
        userAnswers[qid] = value;
        e.target.parentNode.querySelectorAll(".option-btn").forEach(s=>s.classList.remove("selected"));
        e.target.classList.add("selected");
      } else { // ordering circle
        let cur = parseInt(userAnswers[qid]) || 0;
        cur = cur % 3 + 1;
        userAnswers[qid] = cur;
        e.target.textContent = cur;
      }
    });
  });

  document.querySelectorAll("textarea").forEach(ta=>{
    ta.addEventListener("input", e=>{
      userAnswers[e.target.dataset.qid] = e.target.value;
    });
  });
}

function updateNav() {
  prevBtn.style.visibility = currentStep === 0 ? "hidden" : "visible";
  nextBtn.textContent = currentStep === currentTest.quizData.length - 1 ? "Finish Test" : "Next";
  buildProgress();
}

function nextQuestion() {
  if (currentStep < currentTest.quizData.length - 1) {
    currentStep++;
    renderQuestion();
  } else {
    finishTest();
  }
}

function prevQuestion() {
  if (currentStep > 0) {
    currentStep--;
    renderQuestion();
  }
}

function openDictionary(focusWord=null) {
  if (!currentTest) return;
  let html = "";
  Object.entries(currentTest.dictionary).forEach(([word,def])=>{
    const isFocus = focusWord && word.toLowerCase()===focusWord.toLowerCase();
    html += `<p class="${isFocus?"highlight-word":""}"><strong>${word}:</strong> ${def}</p>`;
  });
  dictModalText.innerHTML = html;
  dictOverlay.classList.add("active");
  if (focusWord) setTimeout(()=>{
    const el = dictModalText.querySelector(".highlight-word");
    if (el) el.scrollIntoView({behavior:"smooth",block:"center"});
  },60);
}

// Normalize text helper
function normalizeText(text) {
    if (!text) return "";
    return text.toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()@?\[\]]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Keyword matcher for Text Answers
function containsKeywords(userText, keywords) {
    const normalizedUser = normalizeText(userText);
    let matches = 0;
    for (const kw of keywords) {
        if (normalizedUser.includes(normalizeText(kw))) {
            matches++;
        }
    }
    return matches >= Math.ceil(keywords.length / 2);
}

// --- GRADING LOGIC ---
function calculateScore() {
    let totalScore = 0;
    let bubbles = [];
    let breakdownHTML = '';
    
    currentTest.quizData.forEach((q, index) => {
        let correctCount = 0;
        let totalItems = 0;
        
        if (q.type === 'mcq-single') {
            totalItems = 1;
            const userAns = userAnswers["single" + index];
            const correctAns = currentTest.answers[q.id];
            if (userAns === correctAns) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
        } else if (q.type === 'tf-group' || q.type === 'para-match' || q.type === 'mcq-group') {
            if (q.questions) {
                q.questions.forEach(item => {
                    totalItems++;
                    const userAns = userAnswers[item.id];
                    const correctAns = currentTest.answers[item.id];
                    if (userAns === correctAns) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
                });
            }
        } else if (q.type === 'text-group') {
            if (q.questions) {
                q.questions.forEach(item => {
                    totalItems++;
                    const userAns = userAnswers[item.id] || "";
                    const correctAns = currentTest.answers[item.id] || [];
                    if (containsKeywords(userAns, correctAns)) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
                });
            }
        } else if (q.type === 'ordering') {
            if (q.items) {
                q.items.forEach(item => {
                    totalItems++;
                    const userAns = userAnswers[item.id];
                    const correctAns = currentTest.answers.order ? currentTest.answers.order[item.id] : null;
                    if (parseInt(userAns) === correctAns) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
                });
            }
        }
        
        breakdownHTML += `<div class="breakdown-row"><span class="breakdown-label">Q${q.id}: ${q.title.substring(0, 20)}...</span><span class="breakdown-score">${correctCount}/${totalItems}</span></div>`;
    });

    return { totalScore, bubbles, breakdownHTML };
}

function finishTest() {
    quizScreen.classList.remove("active");
    resultScreen.classList.add("active");
    
    const { totalScore, bubbles, breakdownHTML } = calculateScore();
    
    const percentageScore = bubbles.length > 0 ? ((totalScore / bubbles.length) * 100).toFixed(2) : "0.00";
    document.getElementById("final-score").textContent = `${percentageScore}/100`;
    document.getElementById("score-breakdown").innerHTML = breakdownHTML;

    if(totalScore >= bubbles.length * 0.7) {
        document.getElementById("result-message").textContent = 'Excellent work! You have a solid understanding of the text.';
    } else if(totalScore >= bubbles.length * 0.5) {
        document.getElementById("result-message").textContent = 'Good effort! Keep practicing your reading skills.';
    } else {
        document.getElementById("result-message").textContent = 'Needs improvement. Review the text and try again!';
    }

    setTimeout(() => {
        createBubbles(bubbles);
    }, 300);

    sendToTelegram(percentageScore);
}

function createBubbles(bubblesArray) {
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'bubble-container';
    
    bubblesArray.forEach(isCorrect => {
        const bubble = document.createElement('div');
        bubble.className = `floating-bubble ${isCorrect ? 'correct' : 'wrong'}`;
        bubble.style.marginLeft = `${Math.random() * 20 - 10}px`;
        bubbleContainer.appendChild(bubble);
    });

    appContainer.appendChild(bubbleContainer);
    setTimeout(() => { bubbleContainer.remove(); }, 2000);
}

async function sendToTelegram(percentageScore) {
    const telegramStatus = document.getElementById("telegram-status");
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    try {
        const response = await fetch('/api/send-quiz-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quizName: currentTest.title,
                username: studentUsername,
                score: percentageScore,
                date: dateStr,
                time: timeStr
            })
        });
        const data = await response.json();
        if (data.success) {
            telegramStatus.textContent = '✅ Score sent to your teacher successfully!';
            telegramStatus.style.color = 'green';
        } else {
            telegramStatus.textContent = '⚠️ Error sending score. Please inform your teacher.';
            telegramStatus.style.color = 'red';
        }
    } catch (error) {
        telegramStatus.textContent = '⚠️ Network error. Could not send score.';
        telegramStatus.style.color = 'red';
    }
}

// ==========================================
// DYNAMIC PDF GENERATION
// ==========================================
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Test Review: ${currentTest.title}`, 105, 20, null, null, 'center');
    doc.setFontSize(12);
    doc.text(`Student: ${studentUsername}`, 14, 30);
    doc.text(`Score: ${document.getElementById('final-score').textContent} / 100`, 14, 40);
    
    let y = 50;
    const lineH = 7;
    
    const addQ = (qText, studentAns, correctAns) => {
        if(y > 270) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold');
        const qLines = doc.splitTextToSize(qText, 180);
        doc.text(qLines, 14, y); y += (qLines.length * lineH);
        
        doc.setFont(undefined, 'normal');
        const sLines = doc.splitTextToSize(`Your Answer: ${studentAns || 'N/A'}`, 180);
        doc.text(sLines, 20, y); y += (sLines.length * lineH);
        
        doc.setTextColor(0, 100, 0); // Dark green for correct answer
        const cLines = doc.splitTextToSize(`Correct Answer: ${correctAns}`, 180);
        doc.text(cLines, 20, y); y += (cLines.length * lineH);
        doc.setTextColor(0, 0, 0); // Reset color
        y += 4;
    };

    currentTest.quizData.forEach((q, index) => {
        if (q.type === 'mcq-single') {
            addQ(`Q${q.id}: ${q.title}`, userAnswers["single" + index], currentTest.answers[q.id]);
        } else {
            if (q.questions) {
                q.questions.forEach(item => {
                    let correctAns = currentTest.answers[item.id];
                    if (q.type === 'text-group' && Array.isArray(correctAns)) {
                        correctAns = correctAns.join(', ');
                    }
                    addQ(`Q${item.id}: ${item.text}`, userAnswers[item.id], correctAns);
                });
            } else if (q.items) { // ordering
                q.items.forEach(item => {
                    const correctOrder = currentTest.answers.order ? currentTest.answers.order[item.id] : 'N/A';
                    addQ(`Q${item.id}: ${item.text}`, userAnswers[item.id], `Order: ${correctOrder}`);
                });
            }
        }
    });

    doc.save(`${currentTest.id}-Test-Review.pdf`);
}

init();
