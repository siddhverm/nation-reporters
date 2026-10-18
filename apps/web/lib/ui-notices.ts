/**
 * Reader-facing notices in all 23 supported languages: AI-illustration disclosure, image copyright note,
 * "in brief" / "key points" labels and the copyright & complaints page copy.
 * None of these strings names a publisher or domain.
 */
export type Notices = {
  /** Disclosure shown next to every story image */
  illustration: string;
  /** Small-font asterisk note under story images */
  imageCopyright: string;
  inBrief: string;
  keyPoints: string;
  /** Short footer link label */
  copyrightLink: string;
  cpTitle: string;
  cpAi: string;
  cpHow: string;
};

export const IMAGE_COPYRIGHT_EN =
  '* We do not own the copyright of this image. Image belongs to its original owner; removed on request.';

const EN: Notices = {
  illustration: 'Illustration (AI-generated)',
  imageCopyright: IMAGE_COPYRIGHT_EN,
  inBrief: 'In brief',
  keyPoints: 'Key points',
  copyrightLink: 'Copyright',
  cpTitle: 'Copyright & complaints',
  cpAi: 'Our stories are short summaries written in our own words. Story pictures are AI-generated illustrations, not photographs of the event.',
  cpHow: 'To report a copyright concern or ask for removal of any text or image, email us with the page link and a short description:',
};

export const NOTICES: Record<string, Notices> = {
  en: EN,
  hi: {
    illustration: 'चित्रण (एआई-निर्मित)',
    imageCopyright: '* इस चित्र का कॉपीराइट हमारे पास नहीं है। चित्र अपने मूल स्वामी का है; अनुरोध पर हटा दिया जाएगा।',
    inBrief: 'संक्षेप में', keyPoints: 'मुख्य बातें', copyrightLink: 'कॉपीराइट',
    cpTitle: 'कॉपीराइट और शिकायतें',
    cpAi: 'हमारी खबरें हमारे अपने शब्दों में लिखे छोटे सारांश हैं। खबरों के चित्र एआई से बनाए गए चित्रण हैं, घटना की असली तस्वीरें नहीं।',
    cpHow: 'कॉपीराइट से जुड़ी शिकायत दर्ज करने या किसी पाठ या चित्र को हटवाने के लिए, पेज का लिंक और छोटा विवरण हमें ईमेल करें:',
  },
  mr: {
    illustration: 'चित्रण (एआय-निर्मित)',
    imageCopyright: '* या चित्राचा कॉपीराइट आमच्याकडे नाही. चित्र त्याच्या मूळ मालकाचे आहे; विनंती केल्यास काढून टाकले जाईल.',
    inBrief: 'थोडक्यात', keyPoints: 'मुख्य मुद्दे', copyrightLink: 'कॉपीराइट',
    cpTitle: 'कॉपीराइट आणि तक्रारी',
    cpAi: 'आमच्या बातम्या आमच्याच शब्दांत लिहिलेले छोटे सारांश आहेत. बातम्यांची चित्रे एआयने तयार केलेली चित्रणे आहेत, घटनेची खरी छायाचित्रे नाहीत.',
    cpHow: 'कॉपीराइटबाबत तक्रार करण्यासाठी किंवा कोणताही मजकूर वा चित्र काढण्यासाठी, पेजची लिंक आणि थोडक्यात वर्णन आम्हाला ईमेल करा:',
  },
  bn: {
    illustration: 'চিত্র (এআই-নির্মিত)',
    imageCopyright: '* এই ছবির কপিরাইট আমাদের নয়। ছবিটি এর মূল মালিকের; অনুরোধে সরিয়ে দেওয়া হবে।',
    inBrief: 'সংক্ষেপে', keyPoints: 'মূল বিষয়', copyrightLink: 'কপিরাইট',
    cpTitle: 'কপিরাইট ও অভিযোগ',
    cpAi: 'আমাদের খবর আমাদের নিজের ভাষায় লেখা ছোট সারাংশ। খবরের ছবিগুলি এআই-নির্মিত চিত্র, ঘটনার আসল ছবি নয়।',
    cpHow: 'কপিরাইট নিয়ে অভিযোগ জানাতে বা কোনও লেখা বা ছবি সরাতে, পেজের লিংক ও সংক্ষিপ্ত বিবরণ সহ আমাদের ইমেল করুন:',
  },
  te: {
    illustration: 'చిత్రణ (ఏఐ ద్వారా రూపొందించబడింది)',
    imageCopyright: '* ఈ చిత్రం కాపీరైట్ మాది కాదు. చిత్రం దాని అసలు యజమానిది; అభ్యర్థనపై తొలగిస్తాం.',
    inBrief: 'క్లుప్తంగా', keyPoints: 'ముఖ్యాంశాలు', copyrightLink: 'కాపీరైట్',
    cpTitle: 'కాపీరైట్ & ఫిర్యాదులు',
    cpAi: 'మా వార్తలు మా సొంత మాటల్లో రాసిన చిన్న సారాంశాలు. వార్తల చిత్రాలు ఏఐ రూపొందించిన చిత్రణలు, సంఘటన అసలు ఫోటోలు కావు.',
    cpHow: 'కాపీరైట్ ఫిర్యాదు చేయడానికి లేదా ఏదైనా పాఠ్యం లేదా చిత్రాన్ని తొలగించమని కోరడానికి, పేజీ లింక్ మరియు చిన్న వివరణతో మాకు ఇమెయిల్ చేయండి:',
  },
  ta: {
    illustration: 'விளக்கப்படம் (AI உருவாக்கியது)',
    imageCopyright: '* இந்தப் படத்தின் பதிப்புரிமை எங்களுக்கு இல்லை. படம் அதன் அசல் உரிமையாளருக்குச் சொந்தம்; கோரிக்கையின் பேரில் நீக்கப்படும்.',
    inBrief: 'சுருக்கமாக', keyPoints: 'முக்கிய அம்சங்கள்', copyrightLink: 'பதிப்புரிமை',
    cpTitle: 'பதிப்புரிமை & புகார்கள்',
    cpAi: 'எங்கள் செய்திகள் எங்கள் சொந்த வார்த்தைகளில் எழுதப்பட்ட சிறு சுருக்கங்கள். செய்திப் படங்கள் AI உருவாக்கிய விளக்கப்படங்கள்; நிகழ்வின் உண்மையான புகைப்படங்கள் அல்ல.',
    cpHow: 'பதிப்புரிமை புகார் தெரிவிக்க அல்லது எந்த உரையையும் படத்தையும் நீக்கக் கோர, பக்க இணைப்பு மற்றும் சிறு விளக்கத்துடன் எங்களுக்கு மின்னஞ்சல் செய்யவும்:',
  },
  gu: {
    illustration: 'ચિત્રણ (AI દ્વારા બનાવેલ)',
    imageCopyright: '* આ છબીનો કૉપિરાઇટ અમારી પાસે નથી. છબી તેના મૂળ માલિકની છે; વિનંતી પર દૂર કરવામાં આવશે.',
    inBrief: 'ટૂંકમાં', keyPoints: 'મુખ્ય મુદ્દા', copyrightLink: 'કૉપિરાઇટ',
    cpTitle: 'કૉપિરાઇટ અને ફરિયાદો',
    cpAi: 'અમારા સમાચાર અમારા પોતાના શબ્દોમાં લખેલા ટૂંકા સારાંશ છે. સમાચારની છબીઓ AI દ્વારા બનાવેલા ચિત્રણ છે, ઘટનાના અસલ ફોટા નથી.',
    cpHow: 'કૉપિરાઇટ અંગે ફરિયાદ કરવા અથવા કોઈ લખાણ કે છબી દૂર કરાવવા, પેજની લિંક અને ટૂંકા વર્ણન સાથે અમને ઇમેઇલ કરો:',
  },
  kn: {
    illustration: 'ಚಿತ್ರಣ (AI ರಚಿತ)',
    imageCopyright: '* ಈ ಚಿತ್ರದ ಹಕ್ಕುಸ್ವಾಮ್ಯ ನಮ್ಮದಲ್ಲ. ಚಿತ್ರ ಅದರ ಮೂಲ ಮಾಲೀಕರಿಗೆ ಸೇರಿದ್ದು; ಕೋರಿಕೆಯ ಮೇರೆಗೆ ತೆಗೆದುಹಾಕಲಾಗುವುದು.',
    inBrief: 'ಸಂಕ್ಷಿಪ್ತವಾಗಿ', keyPoints: 'ಮುಖ್ಯ ಅಂಶಗಳು', copyrightLink: 'ಹಕ್ಕುಸ್ವಾಮ್ಯ',
    cpTitle: 'ಹಕ್ಕುಸ್ವಾಮ್ಯ ಮತ್ತು ದೂರುಗಳು',
    cpAi: 'ನಮ್ಮ ಸುದ್ದಿಗಳು ನಮ್ಮದೇ ಮಾತುಗಳಲ್ಲಿ ಬರೆದ ಸಣ್ಣ ಸಾರಾಂಶಗಳು. ಸುದ್ದಿ ಚಿತ್ರಗಳು AI ರಚಿಸಿದ ಚಿತ್ರಣಗಳು, ಘಟನೆಯ ನಿಜವಾದ ಛಾಯಾಚಿತ್ರಗಳಲ್ಲ.',
    cpHow: 'ಹಕ್ಕುಸ್ವಾಮ್ಯ ದೂರು ನೀಡಲು ಅಥವಾ ಯಾವುದೇ ಪಠ್ಯ ಅಥವಾ ಚಿತ್ರ ತೆಗೆಯಲು ಕೋರಲು, ಪುಟದ ಲಿಂಕ್ ಮತ್ತು ಸಣ್ಣ ವಿವರಣೆಯೊಂದಿಗೆ ನಮಗೆ ಇಮೇಲ್ ಮಾಡಿ:',
  },
  pa: {
    illustration: 'ਚਿੱਤਰ (AI ਦੁਆਰਾ ਬਣਾਇਆ)',
    imageCopyright: '* ਇਸ ਤਸਵੀਰ ਦਾ ਕਾਪੀਰਾਈਟ ਸਾਡੇ ਕੋਲ ਨਹੀਂ ਹੈ। ਤਸਵੀਰ ਆਪਣੇ ਮੂਲ ਮਾਲਕ ਦੀ ਹੈ; ਬੇਨਤੀ ਕਰਨ ’ਤੇ ਹਟਾ ਦਿੱਤੀ ਜਾਵੇਗੀ।',
    inBrief: 'ਸੰਖੇਪ ਵਿੱਚ', keyPoints: 'ਮੁੱਖ ਗੱਲਾਂ', copyrightLink: 'ਕਾਪੀਰਾਈਟ',
    cpTitle: 'ਕਾਪੀਰਾਈਟ ਅਤੇ ਸ਼ਿਕਾਇਤਾਂ',
    cpAi: 'ਸਾਡੀਆਂ ਖ਼ਬਰਾਂ ਸਾਡੇ ਆਪਣੇ ਸ਼ਬਦਾਂ ਵਿੱਚ ਲਿਖੇ ਛੋਟੇ ਸਾਰ ਹਨ। ਖ਼ਬਰਾਂ ਦੀਆਂ ਤਸਵੀਰਾਂ AI ਵੱਲੋਂ ਬਣਾਏ ਚਿੱਤਰ ਹਨ, ਘਟਨਾ ਦੀਆਂ ਅਸਲ ਤਸਵੀਰਾਂ ਨਹੀਂ।',
    cpHow: 'ਕਾਪੀਰਾਈਟ ਬਾਰੇ ਸ਼ਿਕਾਇਤ ਕਰਨ ਜਾਂ ਕੋਈ ਲਿਖਤ ਜਾਂ ਤਸਵੀਰ ਹਟਾਉਣ ਲਈ, ਪੰਨੇ ਦੇ ਲਿੰਕ ਅਤੇ ਛੋਟੇ ਵੇਰਵੇ ਸਮੇਤ ਸਾਨੂੰ ਈਮੇਲ ਕਰੋ:',
  },
  ur: {
    illustration: 'مثالی تصویر (اے آئی سے تیار کردہ)',
    imageCopyright: '* اس تصویر کا کاپی رائٹ ہمارے پاس نہیں ہے۔ تصویر اپنے اصل مالک کی ہے؛ درخواست پر ہٹا دی جائے گی۔',
    inBrief: 'مختصراً', keyPoints: 'اہم نکات', copyrightLink: 'کاپی رائٹ',
    cpTitle: 'کاپی رائٹ اور شکایات',
    cpAi: 'ہماری خبریں ہمارے اپنے الفاظ میں لکھے مختصر خلاصے ہیں۔ خبروں کی تصاویر اے آئی سے بنائی گئی مثالی تصاویر ہیں، واقعے کی اصل تصاویر نہیں۔',
    cpHow: 'کاپی رائٹ کی شکایت درج کرانے یا کسی متن یا تصویر کو ہٹوانے کے لیے، صفحے کے لنک اور مختصر تفصیل کے ساتھ ہمیں ای میل کریں:',
  },
  ml: {
    illustration: 'ചിത്രീകരണം (AI നിർമ്മിതം)',
    imageCopyright: '* ഈ ചിത്രത്തിന്റെ പകർപ്പവകാശം ഞങ്ങൾക്കില്ല. ചിത്രം അതിന്റെ യഥാർത്ഥ ഉടമയുടേതാണ്; അഭ്യർത്ഥനപ്രകാരം നീക്കം ചെയ്യും.',
    inBrief: 'ചുരുക്കത്തിൽ', keyPoints: 'പ്രധാന കാര്യങ്ങൾ', copyrightLink: 'പകർപ്പവകാശം',
    cpTitle: 'പകർപ്പവകാശവും പരാതികളും',
    cpAi: 'ഞങ്ങളുടെ വാർത്തകൾ ഞങ്ങളുടെ സ്വന്തം വാക്കുകളിൽ എഴുതിയ ചെറു സംഗ്രഹങ്ങളാണ്. വാർത്താചിത്രങ്ങൾ AI നിർമ്മിച്ച ചിത്രീകരണങ്ങളാണ്, സംഭവത്തിന്റെ യഥാർത്ഥ ഫോട്ടോകളല്ല.',
    cpHow: 'പകർപ്പവകാശ പരാതി അറിയിക്കാനോ ഏതെങ്കിലും വാചകമോ ചിത്രമോ നീക്കം ചെയ്യാൻ ആവശ്യപ്പെടാനോ, പേജ് ലിങ്കും ചെറിയ വിവരണവും സഹിതം ഞങ്ങൾക്ക് ഇമെയിൽ ചെയ്യുക:',
  },
  ar: {
    illustration: 'رسم توضيحي (مُنشأ بالذكاء الاصطناعي)',
    imageCopyright: '* لا نملك حقوق النشر لهذه الصورة. الصورة ملك لصاحبها الأصلي، وتُزال عند الطلب.',
    inBrief: 'باختصار', keyPoints: 'أهم النقاط', copyrightLink: 'حقوق النشر',
    cpTitle: 'حقوق النشر والشكاوى',
    cpAi: 'أخبارنا ملخصات قصيرة مكتوبة بأسلوبنا الخاص. صور الأخبار رسوم توضيحية أنشأها الذكاء الاصطناعي وليست صوراً فوتوغرافية للحدث.',
    cpHow: 'للإبلاغ عن مخالفة لحقوق النشر أو لطلب إزالة أي نص أو صورة، راسلنا مع رابط الصفحة ووصف موجز:',
  },
  fr: {
    illustration: 'Illustration (générée par IA)',
    imageCopyright: '* Nous ne détenons pas les droits d’auteur de cette image. L’image appartient à son propriétaire d’origine ; retirée sur demande.',
    inBrief: 'En bref', keyPoints: 'Points clés', copyrightLink: 'Droits d’auteur',
    cpTitle: 'Droits d’auteur et réclamations',
    cpAi: 'Nos articles sont de courts résumés rédigés avec nos propres mots. Les images sont des illustrations générées par IA, pas des photographies de l’événement.',
    cpHow: 'Pour signaler un problème de droits d’auteur ou demander le retrait d’un texte ou d’une image, écrivez-nous avec le lien de la page et une courte description :',
  },
  de: {
    illustration: 'Illustration (KI-generiert)',
    imageCopyright: '* Wir besitzen nicht das Urheberrecht an diesem Bild. Das Bild gehört seinem ursprünglichen Eigentümer; auf Anfrage wird es entfernt.',
    inBrief: 'Kurz gesagt', keyPoints: 'Die wichtigsten Punkte', copyrightLink: 'Urheberrecht',
    cpTitle: 'Urheberrecht und Beschwerden',
    cpAi: 'Unsere Beiträge sind kurze Zusammenfassungen in eigenen Worten. Die Bilder sind KI-generierte Illustrationen, keine Fotos des Ereignisses.',
    cpHow: 'Um ein Urheberrechtsproblem zu melden oder die Entfernung eines Textes oder Bildes zu verlangen, schreiben Sie uns mit dem Seitenlink und einer kurzen Beschreibung:',
  },
  es: {
    illustration: 'Ilustración (generada por IA)',
    imageCopyright: '* No somos titulares de los derechos de autor de esta imagen. La imagen pertenece a su propietario original; se retira a petición.',
    inBrief: 'En breve', keyPoints: 'Puntos clave', copyrightLink: 'Derechos de autor',
    cpTitle: 'Derechos de autor y reclamaciones',
    cpAi: 'Nuestras noticias son resúmenes breves escritos con nuestras propias palabras. Las imágenes son ilustraciones generadas por IA, no fotografías del suceso.',
    cpHow: 'Para informar de un problema de derechos de autor o pedir la retirada de un texto o una imagen, escríbenos con el enlace de la página y una breve descripción:',
  },
  pt: {
    illustration: 'Ilustração (gerada por IA)',
    imageCopyright: '* Não detemos os direitos autorais desta imagem. A imagem pertence ao seu proprietário original; removida mediante solicitação.',
    inBrief: 'Em resumo', keyPoints: 'Pontos principais', copyrightLink: 'Direitos autorais',
    cpTitle: 'Direitos autorais e reclamações',
    cpAi: 'Nossas notícias são resumos curtos escritos com nossas próprias palavras. As imagens são ilustrações geradas por IA, não fotografias do acontecimento.',
    cpHow: 'Para relatar uma questão de direitos autorais ou pedir a remoção de qualquer texto ou imagem, envie-nos um e-mail com o link da página e uma breve descrição:',
  },
  ru: {
    illustration: 'Иллюстрация (создана ИИ)',
    imageCopyright: '* Авторские права на это изображение нам не принадлежат. Изображение принадлежит первоначальному владельцу; удаляется по запросу.',
    inBrief: 'Коротко', keyPoints: 'Главное', copyrightLink: 'Авторские права',
    cpTitle: 'Авторские права и жалобы',
    cpAi: 'Наши материалы — это краткие пересказы, написанные нашими словами. Картинки к новостям — иллюстрации, созданные ИИ, а не фотографии события.',
    cpHow: 'Чтобы сообщить о нарушении авторских прав или попросить удалить текст или изображение, напишите нам, указав ссылку на страницу и краткое описание:',
  },
  zh: {
    illustration: '插图（AI生成）',
    imageCopyright: '* 我们不拥有此图片的版权。图片归原所有者所有；应要求可删除。',
    inBrief: '简要', keyPoints: '要点', copyrightLink: '版权',
    cpTitle: '版权与投诉',
    cpAi: '我们的报道是用我们自己的话写成的简短摘要。新闻配图是AI生成的插图，并非事件现场照片。',
    cpHow: '如需反映版权问题或要求删除任何文字或图片，请发送邮件并附上页面链接和简要说明：',
  },
  ja: {
    illustration: 'イラスト（AI生成）',
    imageCopyright: '* この画像の著作権は当サイトにはありません。画像は元の所有者に帰属します。ご要望があれば削除します。',
    inBrief: '要点', keyPoints: 'ポイント', copyrightLink: '著作権',
    cpTitle: '著作権と苦情',
    cpAi: '当サイトの記事は、自分たちの言葉で書いた短い要約です。記事の画像はAIが生成したイラストで、出来事の写真ではありません。',
    cpHow: '著作権に関するご指摘や、文章・画像の削除をご希望の場合は、ページのリンクと簡単な説明を添えてメールでご連絡ください：',
  },
  ko: {
    illustration: '일러스트(AI 생성)',
    imageCopyright: '* 이 이미지의 저작권은 당사에 없습니다. 이미지는 원 소유자에게 있으며, 요청 시 삭제됩니다.',
    inBrief: '간단히', keyPoints: '핵심 정리', copyrightLink: '저작권',
    cpTitle: '저작권 및 불만 접수',
    cpAi: '저희 기사는 저희 말로 쓴 짧은 요약입니다. 기사 이미지는 AI가 만든 일러스트이며 사건 현장 사진이 아닙니다.',
    cpHow: '저작권 문제를 신고하거나 글 또는 이미지 삭제를 요청하려면 페이지 링크와 간단한 설명을 이메일로 보내 주세요:',
  },
  id: {
    illustration: 'Ilustrasi (dibuat oleh AI)',
    imageCopyright: '* Kami tidak memiliki hak cipta gambar ini. Gambar milik pemilik aslinya; dihapus atas permintaan.',
    inBrief: 'Ringkasnya', keyPoints: 'Poin penting', copyrightLink: 'Hak cipta',
    cpTitle: 'Hak cipta & keluhan',
    cpAi: 'Berita kami adalah ringkasan singkat yang ditulis dengan kata-kata kami sendiri. Gambar berita adalah ilustrasi buatan AI, bukan foto kejadian.',
    cpHow: 'Untuk melaporkan masalah hak cipta atau meminta penghapusan teks atau gambar, kirim email kepada kami dengan tautan halaman dan deskripsi singkat:',
  },
  tr: {
    illustration: 'Illüstrasyon (yapay zekâ ile üretildi)',
    imageCopyright: '* Bu görselin telif hakkı bize ait değildir. Görsel asıl sahibine aittir; talep üzerine kaldırılır.',
    inBrief: 'Kısaca', keyPoints: 'Önemli noktalar', copyrightLink: 'Telif hakkı',
    cpTitle: 'Telif hakkı ve şikâyetler',
    cpAi: 'Haberlerimiz kendi sözcüklerimizle yazılmış kısa özetlerdir. Haber görselleri yapay zekâ ile üretilmiş illüstrasyonlardır, olayın fotoğrafı değildir.',
    cpHow: 'Telif hakkı sorununu bildirmek veya bir metnin ya da görselin kaldırılmasını istemek için sayfa bağlantısı ve kısa bir açıklamayla bize e-posta gönderin:',
  },
  it: {
    illustration: 'Illustrazione (generata dall’IA)',
    imageCopyright: '* Non deteniamo il copyright di questa immagine. L’immagine appartiene al suo proprietario originale; rimossa su richiesta.',
    inBrief: 'In breve', keyPoints: 'Punti chiave', copyrightLink: 'Copyright',
    cpTitle: 'Copyright e reclami',
    cpAi: 'Le nostre notizie sono brevi riassunti scritti con parole nostre. Le immagini sono illustrazioni generate dall’IA, non fotografie dell’evento.',
    cpHow: 'Per segnalare un problema di copyright o chiedere la rimozione di un testo o di un’immagine, scrivici con il link della pagina e una breve descrizione:',
  },
};

export function getNotices(lang: string | null | undefined): Notices {
  const code = (lang ?? 'en').toLowerCase().split(/[-_]/)[0];
  return NOTICES[code] ?? EN;
}
