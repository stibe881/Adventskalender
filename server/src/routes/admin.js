const express = require("express");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const config = require("../config");
const db = require("../db");
const { requireAuth, signUserToken, setAuthCookie } = require("../middleware/auth");
const { generateToken, generateId } = require("../utils/token");
const { generateQrDataUrl } = require("../utils/qr");
const { CONTENT_TYPES, THEMES } = require("../utils/contentTypes");
const { unlockDateISO, getTodayParts } = require("../utils/time");

const router = express.Router();
router.use(requireAuth);

function makeEmptyDays() {
  return Array.from({ length: 24 }, (_, i) => ({
    day: i + 1,
    contentType: null,
    content: null,
    opened: false,
    openedAt: null,
  }));
}

function applyTemplate(days, templateId) {
  const mindfulTasks = [
    "Nimm dir 3 bewusste, tiefe Atemzüge.",
    "Trinke eine Tasse Tee oder Kaffee ganz ohne Ablenkung.",
    "Schreibe 3 Dinge auf, für die du heute dankbar bist.",
    "Mache einen 10-minütigen Spaziergang an der frischen Luft.",
    "Lege dein Handy für die nächste Stunde in einen anderen Raum.",
    "Lächle dich selbst im Spiegel an und sage dir etwas Nettes.",
    "Höre dein absolutes Lieblingslied und singe oder summe mit.",
    "Räume einen kleinen Bereich auf (z.B. deinen Schreibtisch).",
    "Schließe die Augen und achte 2 Minuten lang nur auf deinen Körper.",
    "Schreibe einer Person, die du magst, eine nette Nachricht.",
    "Lies ein Kapitel in einem Buch, das du schon lange lesen wolltest.",
    "Dehne deinen Körper für 5 Minuten durch.",
    "Genieße ein Stück Schokolade oder Obst ganz langsam und bewusst.",
    "Mach heute bewusst ein Kompliment an jemand anderen.",
    "Gönne dir heute Abend eine extra lange Dusche oder ein Bad.",
    "Beobachte für ein paar Minuten die Wolken oder die Natur.",
    "Notiere dir einen Erfolg, den du in letzter Zeit gefeiert hast.",
    "Versuche heute, dich über nichts aufzuregen und gelassen zu bleiben.",
    "Zünde eine Kerze an und betrachte die Flamme für eine Minute.",
    "Höre einen beruhigenden Podcast oder entspannende Musik.",
    "Gehe heute 15 Minuten früher ins Bett als sonst.",
    "Mache dir ein schönes, gesundes Frühstück.",
    "Denke an einen besonders schönen Moment aus diesem Jahr zurück.",
    "Nimm dir Zeit für dich selbst und mache genau das, worauf du jetzt Lust hast."
  ];

  if (templateId === "romantic") {
    const reasons = [
      "Du bringst mich jeden Tag zum Lächeln, egal wie schwer es war.",
      "Du bist mein bester Freund und mein größter Rückhalt.",
      "Ich liebe es, wie du mich ansiehst, wenn du denkst, dass ich es nicht bemerke.",
      "Mit dir fühlt sich selbst ein langweiliger Tag wie ein Abenteuer an.",
      "Du verstehst mich auch ohne Worte.",
      "Ich liebe deinen unverwechselbaren Geruch, der mir immer ein Gefühl von Zuhause gibt.",
      "Du hast die schönste Lache, die ich je gehört habe.",
      "Du glaubst immer an mich, selbst wenn ich selbst mal zweifle.",
      "Deine Umarmungen sind der sicherste Ort der Welt für mich.",
      "Du kümmerst dich so liebevoll um die Menschen, die dir wichtig sind.",
      "Ich liebe es, wie wir zusammen über die albernsten Dinge lachen können.",
      "Du forderst mich heraus und hilfst mir, eine bessere Version meiner selbst zu werden.",
      "Deine Augen strahlen so wunderschön, wenn du dich über etwas freust.",
      "Ich liebe die Art, wie du schläfst und wie friedlich du dabei aussiehst.",
      "Du bist unglaublich klug und ich liebe unsere tiefen Gespräche.",
      "Du weißt immer genau, was ich brauche, um mich besser zu fühlen.",
      "Ich liebe es, Pläne für unsere gemeinsame Zukunft zu schmieden.",
      "Du bist mein Ruhepol in dieser oft so hektischen Welt.",
      "Ich liebe deine kleinen Macken, die dich einfach so einzigartig machen.",
      "Du gibst mir jeden Tag das Gefühl, bedingungslos geliebt zu werden.",
      "Ich bewundere deine Leidenschaft und Hingabe für das, was du tust.",
      "Du bist das Puzzleteil, das mir immer gefehlt hat.",
      "Ich liebe unsere kleinen Insider-Witze, die nur wir beide verstehen.",
      "Du bist einfach du – und genau so bist du perfekt für mich."
    ];
    days.forEach(d => {
      d.contentType = "text";
      const reason = reasons[(d.day - 1) % reasons.length];
      d.content = { message: `Grund #${d.day}, warum ich dich liebe:\n\n${reason}`, sender: "Dein Schatz" };
    });
  } else if (templateId === "mindful") {
    days.forEach(d => {
      d.contentType = "challenge";
      d.content = { task: `Achtsamkeitsübung: ${mindfulTasks[d.day - 1]}`, btnText: "Erledigt!", successMessage: "Gut gemacht!" };
    });
  } else if (templateId === "jokes") {
    const jokesList = [
      "Was sagt der große Stift zum kleinen Stift? Wachs-mal-stift!",
      "Warum können Geister so schlecht lügen? Weil man durch sie hindurchsehen kann!",
      "Was ist orange und geht über die Berge? Eine Wanderine!",
      "Treffen sich zwei Magnete. Sagt der eine: 'Was soll ich heute anziehen?'",
      "Was ist braun, knusprig und schwimmt unter Wasser? Ein U-Brot!",
      "Warum summen Bienen? Weil sie den Text nicht kennen!",
      "Wie nennt man ein verschwundenes Rind? Oxford!",
      "Was passiert, wenn man Cola und Bier gleichzeitig trinkt? Man colabiert!",
      "Was macht ein Clown im Büro? Faxen!",
      "Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.",
      "Welches ist das lustigste Tier? Das Scherz-entier!",
      "Warum fressen Eisbären keine Pinguine? Weil sie an entgegengesetzten Polen leben!",
      "Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen!",
      "Was sagt der Hai, wenn er einen Surfer sieht? 'Oh, Frühstück auf dem Brettchen!'",
      "Warum gehen Ameisen nicht in die Kirche? Weil sie in-sekten sind!",
      "Was ist grün, glücklich und hüpft über die Wiese? Eine Freuschrecke!",
      "Warum hat der Mathematiker ein dickes Auge? Er hat sich verrechnet!",
      "Was ist gelb und kann nicht schwimmen? Ein Bagger. Und warum? Weil er nur einen Arm hat!",
      "Wie nennt man ein helles Mammut? Hellmut!",
      "Treffen sich zwei unsichtbare Menschen. Sagt der eine: 'Lange nicht gesehen!'",
      "Was sitzt auf dem Baum und winkt? Ein Huhu!",
      "Warum weint der Geometrie-Lehrer? Weil seine Klasse völlig formlos ist!",
      "Was essen Autos am liebsten? Parkplätzchen!",
      "Warum legen Hühner Eier? Wenn sie sie werfen würden, gingen sie kaputt!"
    ];
    days.forEach(d => {
      d.contentType = "text";
      const joke = jokesList[(d.day - 1) % jokesList.length];
      d.content = { message: `Witz des Tages #${d.day}:\n\n${joke}`, sender: "Spaßvogel" };
    });
  } else if (templateId === "quotes") {
    const quotesList = [
      { text: "Phantasie ist wichtiger als Wissen, denn Wissen ist begrenzt.", author: "Albert Einstein" },
      { text: "Wege entstehen dadurch, dass man sie geht.", author: "Franz Kafka" },
      { text: "Die reinste Form des Wahnsinns ist es, alles beim Alten zu lassen und gleichzeitig zu hoffen, dass sich etwas ändert.", author: "Albert Einstein" },
      { text: "Wer immer tut, was er schon kann, bleibt immer das, was er schon ist.", author: "Henry Ford" },
      { text: "Auch aus Steinen, die einem in den Weg gelegt werden, kann man Schönes bauen.", author: "Johann Wolfgang von Goethe" },
      { text: "Die Zukunft gehört denen, die an die Wahrhaftigkeit ihrer Träume glauben.", author: "Eleanor Roosevelt" },
      { text: "Glaube an dich selbst, und es wird unweigerlich der Tag kommen, an dem andere keine andere Wahl haben, als an dich zu glauben.", author: "Cynthia Kersey" },
      { text: "Das Geheimnis des Erfolgs ist anzufangen.", author: "Mark Twain" },
      { text: "Verweile nicht in der Vergangenheit, träume nicht von der Zukunft. Konzentriere dich auf den gegenwärtigen Moment.", author: "Buddha" },
      { text: "Mut steht am Anfang des Handelns, Glück am Ende.", author: "Demokrit" },
      { text: "Man muss das Unmögliche versuchen, um das Mögliche zu erreichen.", author: "Hermann Hesse" },
      { text: "Das Leben ist wie Fahrrad fahren. Um die Balance zu halten, musst du in Bewegung bleiben.", author: "Albert Einstein" },
      { text: "Es ist nicht zu wenig Zeit, die wir haben, sondern es ist zu viel Zeit, die wir nicht nutzen.", author: "Lucius Annaeus Seneca" },
      { text: "Jeder Tag ist eine neue Chance, das zu tun, was du möchtest.", author: "Friedrich Schiller" },
      { text: "Erfolg ist nicht der Schlüssel zum Glück. Glück ist der Schlüssel zum Erfolg.", author: "Albert Schweitzer" },
      { text: "Was wäre das Leben, hätten wir nicht den Mut, etwas zu riskieren?", author: "Vincent van Gogh" },
      { text: "Der einzige Weg, großartige Arbeit zu leisten, ist, zu lieben, was man tut.", author: "Steve Jobs" },
      { text: "Glück ist kein Geschenk der Götter, sondern die Frucht innerer Einstellung.", author: "Erich Fromm" },
      { text: "Es gibt nur zwei Tage im Jahr, an denen man nichts tun kann. Der eine ist Gestern, der andere Morgen.", author: "Dalai Lama" },
      { text: "Gib jedem Tag die Chance, der schönste deines Lebens zu werden.", author: "Mark Twain" },
      { text: "Die wahre Entdeckungsreise besteht nicht darin, neue Landschaften zu suchen, sondern mit neuen Augen zu sehen.", author: "Marcel Proust" },
      { text: "Ein Ziel ist ein Traum mit einer Frist.", author: "Napoleon Hill" },
      { text: "Man sieht nur mit dem Herzen gut. Das Wesentliche ist für die Augen unsichtbar.", author: "Antoine de Saint-Exupéry" },
      { text: "Der beste Weg, die Zukunft vorauszusagen, ist, sie zu erfinden.", author: "Alan Kay" }
    ];
    days.forEach(d => {
      d.contentType = "text";
      const quote = quotesList[(d.day - 1) % quotesList.length];
      d.content = { message: `Zitat des Tages #${d.day}:\n\n"${quote.text}"\n\n— ${quote.author}`, sender: "Inspiration" };
    });
  } else if (templateId === "fitness") {
    const fitnessChallenges = [
      "Mach 15 Kniebeugen (Squats).",
      "Halte den Unterarmstütz (Plank) für 30 Sekunden.",
      "Mach 10 Liegestütze (auf Knien oder Füßen).",
      "Mache 20 Hampelmänner (Jumping Jacks).",
      "Dehne dich für 5 Minuten komplett durch.",
      "Mach 15 Ausfallschritte (Lunges) pro Bein.",
      "Gehe heute 10.000 Schritte oder mache einen 30-minütigen Spaziergang.",
      "Mach 20 Crunches oder Sit-ups.",
      "Stell dich auf ein Bein und halte die Balance für 60 Sekunden (pro Bein).",
      "Mache 30 Sekunden lang High Knees (Kniehebelauf auf der Stelle).",
      "Mache 15 Trizeps-Dips an einem Stuhl oder der Couch.",
      "Halte die Wandsitz-Position (Wall Sit) für 45 Sekunden.",
      "Mache 10 Burpees (Hocksprünge).",
      "Trinke heute mindestens 2,5 Liter Wasser.",
      "Mach 20 Mountain Climbers (Bergsteiger).",
      "Mache 15 Beckenheben (Glute Bridges) auf dem Boden.",
      "Verzichte heute komplett auf Zucker und Süßigkeiten.",
      "Mach 30 Sekunden lang Schattenboxen.",
      "Dehne deine Beine und versuche mit gestreckten Knien die Zehen zu berühren.",
      "Mache 15 Wadenheben (Calf Raises) an einer Treppenstufe.",
      "Gehe heute alle Treppen zu Fuß und nimm keinen Aufzug.",
      "Mach 40 Sekunden lang Russian Twists für die Bauchmuskeln.",
      "Mache 10 Seitstütze (Side Planks) mit Hüftheben pro Seite.",
      "Mach ein 15-minütiges Yoga- oder Stretching-Workout."
    ];
    days.forEach(d => {
      d.contentType = "challenge";
      const task = fitnessChallenges[(d.day - 1) % fitnessChallenges.length];
      d.content = { task: `Fitness-Challenge #${d.day}:\n${task}`, btnText: "Erledigt!", successMessage: "Stark!" };
    });
  } else if (templateId === "trivia") {
    const triviaQuestions = [
      { q: "Woher kommt der Brauch des Adventskalenders ursprünglich?", o: ["Deutschland", "USA", "Frankreich", "Schweden"], a: 0 },
      { q: "Wie viele Rentiere ziehen laut dem bekannten Lied Santa's Schlitten?", o: ["6", "8", "9", "10"], a: 2 },
      { q: "Welches Gewürz gibt dem Lebkuchen seinen typischen Geschmack?", o: ["Vanille", "Zimt & Nelken", "Kardamom", "Pfeffer"], a: 1 },
      { q: "In welcher Stadt wurde das Jesuskind geboren?", o: ["Jerusalem", "Nazareth", "Bethlehem", "Rom"], a: 2 },
      { q: "Welcher Baum wird traditionell als Weihnachtsbaum verwendet?", o: ["Eiche", "Tanne oder Fichte", "Kiefer", "Buche"], a: 1 },
      { q: "Wer schrieb die bekannte Weihnachtsgeschichte 'A Christmas Carol'?", o: ["Charles Dickens", "William Shakespeare", "Mark Twain", "J.K. Rowling"], a: 0 },
      { q: "Wie heißt der Grinch in der deutschen Version des Films?", o: ["Der Grinch", "Griesgram", "Grüner Klaus", "Schreck"], a: 0 },
      { q: "Aus welchem Land stammt der Stollen ursprünglich?", o: ["Österreich", "Schweiz", "Deutschland", "Polen"], a: 2 },
      { q: "Wie viele Türchen hat ein klassischer Adventskalender?", o: ["20", "24", "25", "31"], a: 1 },
      { q: "Welches Tier ist am Nordpol NICHT zu finden?", o: ["Eisbär", "Pinguin", "Polarfuchs", "Schneeeule"], a: 1 },
      { q: "Was hängen Kinder in den USA und England traditionell an den Kamin?", o: ["Stiefel", "Socken (Stockings)", "Hüte", "Schals"], a: 1 },
      { q: "Wie heißt die rotnasige Rentier-Leitfigur von Santa Claus?", o: ["Rudolph", "Comet", "Cupid", "Blitzen"], a: 0 },
      { q: "Was bedeutet das Wort 'Advent' übersetzt?", o: ["Geschenk", "Warten", "Ankunft", "Winter"], a: 2 },
      { q: "In welchem Monat wird in den meisten orthodoxen Kirchen Weihnachten gefeiert?", o: ["Dezember", "Januar", "Februar", "November"], a: 1 },
      { q: "Welche Pflanze ist ein beliebtes Symbol für Weihnachten, unter der man sich küsst?", o: ["Mistelzweig", "Stechpalme", "Weihnachtsstern", "Tannenzweig"], a: 0 },
      { q: "Welches Lied ist das weltweit am meisten verkaufte Weihnachtslied?", o: ["Last Christmas", "White Christmas", "Jingle Bells", "Silent Night"], a: 1 },
      { q: "Wie nennt man den Vorabend von Weihnachten (24. Dezember)?", o: ["Heiligabend", "Nikolaustag", "Erster Weihnachtstag", "Silvester"], a: 0 },
      { q: "Aus welchem Teig werden klassische Ausstechplätzchen meistens gemacht?", o: ["Hefeteig", "Mürbeteig", "Blätterteig", "Biskuitteig"], a: 1 },
      { q: "Wie viele Zacken hat der Herrnhuter Stern traditionell?", o: ["12", "16", "25", "30"], a: 2 },
      { q: "Welcher Heilige wird am 6. Dezember gefeiert?", o: ["St. Martin", "St. Nikolaus", "St. Patrick", "St. Valentin"], a: 1 },
      { q: "Wo wohnt der Weihnachtsmann der Legende nach?", o: ["Am Nordpol", "In Finnland (Rovaniemi)", "Am Südpol", "Sowohl Nordpol als auch Rovaniemi gelten oft"], a: 3 },
      { q: "Welches Ballett wird traditionell oft zur Weihnachtszeit aufgeführt?", o: ["Schwanensee", "Der Nussknacker", "Dornröschen", "Giselle"], a: 1 },
      { q: "Was verbrennt man traditionell in manchen englischen Haushalten am Kaminfeuer (Yule Log)?", o: ["Einen Tannenbaum", "Einen Holzklotz", "Alte Briefe", "Trockenes Laub"], a: 1 },
      { q: "Wie lautet der berühmte Ausruf von Santa Claus?", o: ["Ho Ho Ho!", "Merry Christmas!", "Jingle All The Way!", "Let it snow!"], a: 0 }
    ];
    days.forEach(d => {
      d.contentType = "quiz";
      const q = triviaQuestions[(d.day - 1) % triviaQuestions.length];
      d.content = { question: `Quizfrage #${d.day}:\n${q.q}`, options: q.o, correctIndex: q.a, successMessage: "Richtig! Klasse gemacht.", failureMessage: "Leider falsch.", prizeText: "10 Punkte", prizeCoins: 10 };
    });
  } else if (templateId === "recipes") {
    const recipes = [
      "Vanillekipferl\nZutaten: 250g Mehl, 200g Butter, 100g Mandeln, 80g Zucker, Vanillezucker.\nZubereitung: Teig kneten, Hörnchen formen. Bei 175°C ca. 10 Min backen. Noch warm in Puder- und Vanillezucker wälzen.",
      "Omas Lebkuchen\nZutaten: 500g Honig, 250g Zucker, 150g Butter, 1kg Mehl, Lebkuchengewürz, Natron.\nZubereitung: Honig, Zucker, Butter erwärmen. Mit Mehl & Gewürzen kneten. Über Nacht ruhen lassen. Ausrollen, backen.",
      "Zimtsterne\nZutaten: 3 Eiweiß, 250g Puderzucker, 400g gemahlene Mandeln, 2 TL Zimt.\nZubereitung: Eiweiß steif schlagen, Puderzucker unterheben (etwas für Guss aufheben). Mandeln & Zimt unterrühren. Ausstechen, bestreichen, backen.",
      "Heißer Bratapfel\nZutaten: 4 Äpfel, 50g Marzipan, 30g Rosinen, 30g Mandeln, Zimt, Butter.\nZubereitung: Äpfel aushöhlen, mit der Mischung füllen, Butterflöckchen darauf. Bei 200°C ca. 25 Min backen.",
      "Selbstgemachter Glühwein\nZutaten: 1 Flasche Rotwein, 1 Orange, 2 Nelken, 1 Zimtstange, 3 EL Zucker.\nZubereitung: Alles langsam in einem Topf erwärmen (nicht kochen!). 20 Min ziehen lassen, Gewürze entfernen.",
      "Spitzbuben (Linzer Plätzchen)\nZutaten: 300g Mehl, 200g Butter, 100g Zucker, 1 Ei, Marmelade.\nZubereitung: Mürbeteig herstellen. Kühlen. Plätzchen ausstechen (die Hälfte mit Loch). Backen. Mit Marmelade zusammensetzen.",
      "Kokosmakronen\nZutaten: 4 Eiweiß, 200g Zucker, 200g Kokosraspeln, etwas Zitronensaft.\nZubereitung: Eiweiß steif schlagen. Zucker einrieseln lassen. Kokos unterheben. Kleine Häufchen bei 150°C ca. 15-20 Min backen.",
      "Heiße Schokolade deluxe\nZutaten: 500ml Milch, 100g Zartbitterschokolade, 1 TL Zimt, Sahne, Marshmallows.\nZubereitung: Schokolade in heißer Milch schmelzen, Zimt dazu. Mit Sahne und Marshmallows toppen.",
      "Butterplätzchen\nZutaten: 300g Mehl, 200g Butter, 100g Zucker, 1 Ei, Vanille.\nZubereitung: Teig kneten, 1 Std. kühlen. Ausstechen. Bei 180°C goldgelb backen. Nach Belieben verzieren.",
      "Schoko-Crossies\nZutaten: 200g Kuvertüre, 100g Cornflakes, 50g Mandelstifte.\nZubereitung: Schokolade schmelzen. Cornflakes und Mandeln unterrühren. Häufchen auf Backpapier setzen und erkalten lassen.",
      "Gebrannte Mandeln\nZutaten: 200g Mandeln, 200g Zucker, 100ml Wasser, 1 TL Zimt.\nZubereitung: Alles in Pfanne aufkochen, rühren bis Wasser verdampft und Zucker trocken wird. Weiter rühren, bis Zucker karamellisiert.",
      "Eierpunsch\nZutaten: 1 Flasche Weißwein, 250ml Eierlikör, 1 Vanilleschote, Zucker, Sahne.\nZubereitung: Wein mit aufgeschnittener Vanilleschote sanft erhitzen. Eierlikör einrühren (nicht kochen). Mit Sahnehaube servieren.",
      "Marzipankartoffeln\nZutaten: 200g Marzipanrohmasse, 50g Puderzucker, 1 EL Rosenwasser, Kakaopulver.\nZubereitung: Marzipan, Puderzucker und Rosenwasser verkneten. Kugeln formen und in Kakao wälzen.",
      "Käsefondue (Klassisch)\nZutaten: 400g Gruyère, 400g Vacherin, 300ml Weißwein, 1 Knoblauchzehe, Kirschwasser, Brot.\nZubereitung: Topf mit Knoblauch ausreiben. Käse im warmen Wein schmelzen. Mit etwas Kirschwasser verfeinern.",
      "Weihnachtliches Tiramisu\nZutaten: 250g Mascarpone, Spekulatius, 200ml Kaffee, Amaretto, Kakaopulver, 2 Eier, Zucker.\nZubereitung: Creme rühren. Spekulatius in Kaffee/Amaretto tauchen. Schichten. Mind. 4 Stunden kühlen, mit Kakao bestäuben.",
      "Pfefferkuchenhaus-Teig\nZutaten: 500g Honig, 250g Zucker, 150g Butter, 1kg Mehl, 2 EL Kakaopulver, Lebkuchengewürz.\nZubereitung: Schmelzen, kneten, kühlen. Hausteile ausschneiden und backen. Mit Zuckerguss zusammenkleben.",
      "Raclette-Idee: Pizza-Pfännchen\nZutaten: Pizzateig, Tomatensoße, Salami, geriebener Käse, Oregano.\nZubereitung: Teig dünn ins Pfännchen drücken, Soße und Belag darauf. Unter dem Raclette-Grill backen, bis der Käse goldbraun ist.",
      "Schneller Apfelstrudel\nZutaten: 1 Pck. Blätterteig, 3 Äpfel, 50g Rosinen, 30g Mandeln, Zimt, Zucker.\nZubereitung: Äpfel würfeln, mit Rest mischen. Auf Teig verteilen, einrollen. Bei 200°C ca. 25 Min backen.",
      "Baileys-Trüffel\nZutaten: 200g Zartbitterschokolade, 100ml Sahne, 4 cl Baileys, Kakaopulver.\nZubereitung: Heiße Sahne über gehackte Schokolade gießen, rühren. Baileys dazu. Kühlen, Kugeln formen, in Kakao wälzen.",
      "Winterlicher Punsch (Alkoholfrei)\nZutaten: 1L Apfelsaft, 500ml Früchtetee, 1 Orange (in Scheiben), 2 Zimtstangen, 3 Nelken.\nZubereitung: Alles in einem großen Topf sanft erhitzen und 15 Minuten ziehen lassen.",
      "Schmalzkuchen\nZutaten: 500g Mehl, 1/2 Würfel Hefe, 250ml lauwarme Milch, 50g Zucker, Puderzucker.\nZubereitung: Hefeteig ansetzen. Ausrollen, in Rauten schneiden. In heißem Fett ausbacken, mit reichlich Puderzucker bestreuen.",
      "Herzhafte Blätterteig-Sterne\nZutaten: 1 Rolle Blätterteig, 100g geriebener Parmesan, Paprikapulver, 1 Ei.\nZubereitung: Sterne ausstechen. Mit Ei bestreichen, Käse und Gewürz bestreuen. Bei 200°C ca. 12 Minuten backen.",
      "Mandarinen-Schichtdessert\nZutaten: 1 Dose Mandarinen, 200g Quark, 100ml Sahne, zerbröselte Kekse.\nZubereitung: Quark süßen, Sahne schlagen & unterheben. In Gläsern Kekse, Mandarinen und Creme schichten.",
      "Klassischer Kartoffelsalat für Heiligabend\nZutaten: 1kg Kartoffeln (festkochend), 1 Zwiebel, heiße Brühe, Öl, Essig, Senf, Schnittlauch.\nZubereitung: Kartoffeln kochen, pellen, in Scheiben schneiden. Warme Brühe-Marinade darübergießen. Ziehen lassen."
    ];
    days.forEach(d => {
      d.contentType = "text";
      const recipe = recipes[(d.day - 1) % recipes.length];
      d.content = { message: `Rezept #${d.day}:\n\n${recipe}`, sender: "Weihnachtsbäckerei" };
    });
  } else if (templateId === "couples_activities") {
    const activities = [
      "Zusammen den Sonnenuntergang anschauen",
      "Heute kochen wir zusammen etwas Neues!",
      "Ein gemeinsamer Spaziergang ohne Handys",
      "Gegenseitig eine Massage geben",
      "Einen Filmabend mit Popcorn machen",
      "Zusammen ein neues Café ausprobieren",
      "Ein Brettspiel oder Kartenspiel spielen",
      "Gegenseitig 3 Dinge sagen, die wir aneinander lieben",
      "Zusammen Plätzchen oder Kuchen backen",
      "Ein heißes Bad zusammen nehmen",
      "Einen Ausflug in die Natur machen",
      "Gemeinsam ein Puzzle beginnen",
      "Ein Picknick im Wohnzimmer veranstalten",
      "Fotos von früher anschauen und in Erinnerungen schwelgen",
      "Zusammen ein Workout oder Yoga machen",
      "Ein leckeres Frühstück im Bett",
      "Einen Glühwein oder heißen Kakao trinken",
      "Zusammen ein Weihnachtsgedicht oder -lied lernen",
      "Gegenseitig einen Wunsch erfüllen",
      "Einen ganzen Abend nur bei Kerzenschein verbringen",
      "Gemeinsam den Sternenhimmel beobachten",
      "Eine Kissenschlacht machen",
      "Zusammen die Weihnachtsdekoration aufhängen",
      "Ein romantisches Dinner zuhause"
    ];
    days.forEach(d => {
      d.contentType = "challenge";
      const activity = activities[(d.day - 1) % activities.length];
      d.content = { task: `Aktivität #${d.day}:\n${activity}`, btnText: "Erledigt!", successMessage: "Schön war's!" };
    });
  } else if (templateId === "kids_fun") {
    const kidsTasks = [
      "Finde 3 rote Dinge im Raum!",
      "Male einen schönen Schneemann und hänge das Bild auf.",
      "Hüpfe 10 Mal auf einem Bein wie ein Flamingo!",
      "Suche dir ein Buch aus und lass dir eine kleine Geschichte vorlesen.",
      "Baue den höchsten Turm aus Bauklötzen oder Kissen, den du schaffen kannst.",
      "Singe laut dein liebstes Weihnachtslied!",
      "Schreibe oder male einen Wunschzettel für den Weihnachtsmann.",
      "Mache ein lustiges Gesicht im Spiegel und versuche, nicht zu lachen.",
      "Räume heute unaufgefordert 3 Spielzeuge an ihren Platz.",
      "Finde etwas Weiches, etwas Hartes und etwas Kaltes im Haus.",
      "Mache ein kleines Tänzchen zu deinem Lieblingslied.",
      "Zähle, wie viele Türen es in eurer Wohnung/im Haus gibt.",
      "Sage jemandem in deiner Familie heute etwas besonders Nettes.",
      "Verstecke einen kleinen Gegenstand und lass jemand anderen danach suchen.",
      "Male einen Stern und schneide ihn (mit Hilfe) vorsichtig aus.",
      "Mache Tiergeräusche nach: Wie macht ein Löwe, eine Kuh und eine Ente?",
      "Balanciere ein Buch für 10 Sekunden auf deinem Kopf.",
      "Schließe die Augen und errate am Geruch, welches Gewürz oder Obst du vor der Nase hast.",
      "Helfe heute beim Tischdecken für das Abendessen.",
      "Versuche, 30 Sekunden lang auf Zehenspitzen zu gehen.",
      "Baue eine kleine Höhle aus Decken und Kissen.",
      "Mache 5 große Froschsprünge durch das Zimmer.",
      "Finde 3 Dinge, die rund sind wie eine Weihnachtskugel.",
      "Gib heute jedem in der Familie eine dicke Umarmung!"
    ];
    days.forEach(d => {
      d.contentType = "challenge";
      const task = kidsTasks[(d.day - 1) % kidsTasks.length];
      d.content = { task: `Rätsel & Spaß #${d.day}:\n${task}`, btnText: "Erledigt!", successMessage: "Toll gemacht!" };
    });
  } else if (templateId === "praise") {
    const compliments = [
      "Du hast ein wundervolles Lächeln, das jeden Raum erhellt.",
      "Ich bewundere deine ehrliche und offene Art.",
      "Mit dir kann man einfach die besten Gespräche führen.",
      "Du bist unglaublich hilfsbereit und immer für andere da.",
      "Dein Humor ist fantastisch – du bringst mich immer zum Lachen!",
      "Ich liebe es, wie leidenschaftlich du über die Dinge sprichst, die dir wichtig sind.",
      "Du strahlst so viel positive Energie aus.",
      "Du bist ein großartiger Zuhörer und gibst immer die besten Ratschläge.",
      "Ich schätze deine Geduld und deine ruhige Art in stressigen Situationen.",
      "Du hast einen tollen Geschmack und Stil.",
      "Deine Kreativität und deine Ideen beeindrucken mich immer wieder.",
      "Es ist bewundernswert, wie du deine Ziele verfolgst und nie aufgibst.",
      "Du schaffst es immer, dass sich Menschen in deiner Nähe wohlfühlen.",
      "Ich mag deine spontane und abenteuerlustige Seite.",
      "Du bist so fürsorglich und hast ein riesiges Herz.",
      "Deine Zuverlässigkeit ist etwas, worauf man sich immer verlassen kann.",
      "Du inspirierst mich dazu, eine bessere Version meiner selbst zu sein.",
      "Ich liebe deine Art, auch in kleinen Dingen das Schöne zu sehen.",
      "Du hast so viel Mut und Stärke in dir.",
      "Deine Begeisterung für das Leben ist absolut ansteckend.",
      "Ich schätze es sehr, dass ich bei dir einfach ich selbst sein darf.",
      "Du gibst nicht auf, auch wenn es mal schwierig wird – das ist beeindruckend.",
      "Du machst die Welt für alle, die dich kennen, ein kleines bisschen schöner.",
      "Danke, dass es dich gibt! Du bist einfach wunderbar, genau so, wie du bist."
    ];
    days.forEach(d => {
      d.contentType = "text";
      const compliment = compliments[(d.day - 1) % compliments.length];
      d.content = { message: `Was ich an dir schätze #${d.day}:\n\n${compliment}`, sender: "Dein Fan" };
    });
  } else if (templateId === "photo_memories") {
    days.forEach(d => {
      d.contentType = "gallery";
      d.content = { images: [], desc: `Unsere schönste Erinnerung #${d.day} (Bitte Bild hochladen)` };
    });
  } else if (templateId === "escape_room") {
    const escapeRiddles = [
      { q: "Ich spreche ohne Mund und höre ohne Ohren. Ich habe keinen Körper, aber ich werde lebendig mit dem Wind. Was bin ich?", o: ["Ein Geist", "Ein Echo", "Ein Traum", "Ein Schatten"], a: 1 },
      { q: "Wenn du mich hast, willst du mich teilen. Wenn du mich teilst, hast du mich nicht mehr. Was bin ich?", o: ["Ein Apfel", "Ein Geheimnis", "Geld", "Liebe"], a: 1 },
      { q: "Du befindest dich in einem dunklen Raum und hast nur ein Streichholz. Es gibt eine Öllampe, eine Kerze und ein Kaminfeuer. Was zündest du zuerst an?", o: ["Die Kerze", "Das Kaminfeuer", "Das Streichholz", "Die Öllampe"], a: 2 },
      { q: "Ich bin immer hungrig, ich muss immer gefüttert werden. Der Finger, den ich berühre, wird bald rot. Was bin ich?", o: ["Ein Vampir", "Das Feuer", "Ein Kaktus", "Ein Tiger"], a: 1 },
      { q: "Wer macht es, hat es nicht. Wer es kauft, braucht es nicht. Wer es benutzt, weiß es nicht. Was ist das?", o: ["Ein Sarg", "Ein Geschenk", "Ein Diamant", "Ein Kissen"], a: 0 },
      { q: "Ich laufe, aber habe keine Beine. Ich murmle, aber habe keine Stimme. Was bin ich?", o: ["Ein Fluss", "Ein Baum", "Der Wind", "Eine Schlange"], a: 0 },
      { q: "Was gehört dir, aber andere Leute benutzen es mehr als du?", o: ["Dein Haus", "Dein Name", "Dein Auto", "Dein Geld"], a: 1 },
      { q: "Ich habe Städte, aber keine Häuser. Ich habe Berge, aber keine Bäume. Ich habe Wasser, aber keine Fische. Was bin ich?", o: ["Eine Wüste", "Eine Landkarte", "Ein Planet", "Ein Traum"], a: 1 },
      { q: "Was wird nasser, je mehr es trocknet?", o: ["Ein Schwamm", "Ein Handtuch", "Ein See", "Die Haut"], a: 1 },
      { q: "Ich habe Schlüssel, öffne aber keine Türen. Ich habe Platz, aber keine Räume. Du kannst eintreten, aber nicht hineingehen. Was bin ich?", o: ["Eine Tastatur", "Ein Safe", "Ein Auto", "Ein Buch"], a: 0 },
      { q: "Was kann man fangen, aber nicht werfen?", o: ["Einen Ball", "Einen Fisch", "Eine Erkältung", "Einen Bumerang"], a: 2 },
      { q: "Was hat ein Auge, kann aber nicht sehen?", o: ["Ein Zyklop", "Ein Hurrikan", "Ein Kartoffel", "Eine Nähnadel"], a: 3 },
      { q: "Was muss gebrochen werden, bevor man es benutzen kann?", o: ["Ein Rekord", "Ein Versprechen", "Ein Ei", "Ein Schloss"], a: 2 },
      { q: "Je mehr es davon gibt, desto weniger siehst du. Was ist es?", o: ["Licht", "Nebel", "Wasser", "Dunkelheit"], a: 3 },
      { q: "Was ist leicht wie eine Feder, aber nicht einmal der stärkste Mensch kann es lange halten?", o: ["Der Atem", "Ein Gedanke", "Ein Geheimnis", "Ein Wassertropfen"], a: 0 },
      { q: "Welcher Monat hat 28 Tage?", o: ["Nur der Februar", "Keiner", "Alle Monate", "Der Dezember"], a: 2 },
      { q: "Was kommt einmal in einer Minute vor, zweimal in einem Moment, aber nie in tausend Jahren?", o: ["Der Buchstabe M", "Die Zeit", "Die Zahl 1", "Ein Wimpernschlag"], a: 0 },
      { q: "Was hat Hände, kann aber nicht klatschen?", o: ["Eine Puppe", "Eine Uhr", "Ein Roboter", "Ein Handschuh"], a: 1 },
      { q: "Was geht durch Städte und Felder, bewegt sich aber nie?", o: ["Der Wind", "Ein Fluss", "Eine Straße", "Die Sonne"], a: 2 },
      { q: "Ich habe einen Kopf und einen Schwanz, aber keinen Körper. Was bin ich?", o: ["Eine Schlange", "Eine Münze", "Ein Komet", "Ein Pfeil"], a: 1 },
      { q: "Welches Wort wird im Wörterbuch immer falsch buchstabiert?", o: ["Richtig", "Falsch", "Fehler", "Schlecht"], a: 1 },
      { q: "Was kann man brechen, ohne es überhaupt anzufassen?", o: ["Ein Glas", "Ein Versprechen", "Einen Rekord", "Beides, Versprechen & Rekord"], a: 3 },
      { q: "Vor mir bist du sicher, doch wenn ich vor dir bin, ist die Gefahr groß. Ich wende mich immer ab. Was bin ich?", o: ["Dein Schatten", "Die Zukunft", "Dein Rücken", "Ein Schild"], a: 2 },
      { q: "CODEKNACKER: Du hast 3 Kisten. Auf Kiste 1 steht 'Gold'. Auf Kiste 2 steht 'Kein Gold'. Auf Kiste 3 steht 'Das Gold ist nicht in Kiste 1'. Nur EINE Aussage stimmt! Wo ist das Gold?", o: ["Kiste 1", "Kiste 2", "Kiste 3", "Es gibt kein Gold"], a: 1 }
    ];
    days.forEach(d => {
      d.contentType = "quiz";
      const q = escapeRiddles[(d.day - 1) % escapeRiddles.length];
      d.content = { question: `Rätsel #${d.day}:\n${q.q}`, options: q.o, correctIndex: q.a, successMessage: "Code geknackt! Tür geöffnet.", failureMessage: "Falsche Antwort. Das Schloss klemmt...", prizeText: "Nächster Hinweis", prizeCoins: 10 };
    });
  }
  return days;
}

function toSummary(cal) {
  const filled = cal.days.filter((d) => d.contentType).length;
  const opened = cal.days.filter((d) => d.opened).length;
  
  let shareUrl = `${config.baseUrl}/c/${cal.token}`;
  if (cal.customConfig && cal.customConfig.subdomain) {
    // Assuming https or using baseUrl scheme
    const scheme = new URL(config.baseUrl).protocol;
    const baseHost = config.baseDomain || new URL(config.baseUrl).host;
    if (baseHost !== "localhost" && baseHost !== "127.0.0.1") {
      shareUrl = `${scheme}//${cal.customConfig.subdomain}.${baseHost}`;
    } else {
      // Fallback for local development or when baseDomain is not set
      shareUrl = `http://${cal.customConfig.subdomain}.localhost:${config.port}`;
    }
  }

  return {
    id: cal.id,
    recipientName: cal.recipientName,
    recipientEmail: cal.recipientEmail,
    ownerName: cal.ownerName,
    theme: cal.theme,
    year: cal.year,
    customConfig: cal.customConfig,
    token: cal.token,
    shareUrl: shareUrl,
    createdAt: cal.createdAt,
    filledDoors: filled,
    openedDoors: opened,
    randomLayout: Boolean(cal.randomLayout),
    collaborators: cal.collaborators || [],
    isPro: Boolean(cal.isPro),
  };
}

// Session Token Refresh (e.g. after Stripe Payment)
router.post("/refresh", async (req, res) => {
  try {
    const user = await db.getUserByEmail(req.user.email);
    if (!user) {
      return res.status(404).json({ error: "Nutzer nicht gefunden." });
    }

    const token = signUserToken(user);
    setAuthCookie(res, token);
    
    res.json({ ok: true, isPro: user.isPro });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Interner Fehler beim Refresh: " + err.message });
  }
});

// Admin Dev-Toggle
router.post("/dev-toggle-pro", async (req, res) => {
  try {
    if (req.user.email !== "stefan.gross@gross-ict.ch") {
      return res.status(403).json({ error: "Nur für stefan.gross@gross-ict.ch" });
    }
    const updatedUser = await db.updateUser(req.user.email, (u) => {
      u.isPro = !u.isPro;
      return u;
    });
    const token = signUserToken(updatedUser);
    setAuthCookie(res, token);
    res.json({ ok: true, isPro: updatedUser.isPro });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const { hasAccess } = require("../utils/access");
const spotify = require("../services/spotify");

// ---------- Calendars ----------

router.get("/calendars", async (req, res) => {
  const calendars = await db.getCalendarsByOwnerOrCollaborator(req.user.id, req.user.email);
  calendars.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(calendars.map(toSummary));
});

router.post("/calendars", async (req, res) => {
  const { recipientName, recipientEmail, theme, year, customConfig, template, randomLayout } = req.body || {};
  if (!recipientName || !String(recipientName).trim()) {
    return res.status(400).json({ error: "Name des Beschenkten ist erforderlich." });
  }
  if (!THEMES.includes(theme)) {
    return res.status(400).json({ error: `Ungültiges Theme. Erlaubt: ${THEMES.join(", ")}` });
  }
  const parsedYear = parseInt(year, 10);
  if (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2200) {
    return res.status(400).json({ error: "Ungültiges Jahr." });
  }

  let days = makeEmptyDays();
  if (template) {
    days = applyTemplate(days, template);
  }

  const calendar = {
    id: generateId(),
    token: generateToken(),
    ownerId: req.user.id,
    ownerName: req.user.username,
    recipientName: String(recipientName).trim(),
    recipientEmail: recipientEmail ? String(recipientEmail).trim() : null,
    collaborators: [],
    theme,
    customConfig: customConfig || null,
    strictMode: Boolean(req.body.strictMode),
    randomLayout: Boolean(randomLayout),
    year: parsedYear,
    createdAt: new Date().toISOString(),
    days,
  };
  await db.createCalendar(calendar);
  res.status(201).json(toSummary(calendar));
});

router.get("/calendars/:id", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden oder kein Zugriff." });
  // Never hand OAuth tokens to the browser; the editor only needs to know the link exists.
  const { spotify: spotifyLink, ...safe } = calendar;
  res.json({ ...safe, spotifyConnected: Boolean(spotifyLink?.refreshToken), spotifyAccount: spotifyLink?.displayName || null });
});

router.put("/calendars/:id", async (req, res) => {
  const { recipientName, recipientEmail, theme, year, customConfig, strictMode, randomLayout } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    if (recipientName && String(recipientName).trim()) cal.recipientName = String(recipientName).trim();
    if (recipientEmail !== undefined) cal.recipientEmail = recipientEmail ? String(recipientEmail).trim() : null;
    if (theme && THEMES.includes(theme)) cal.theme = theme;
    if (customConfig !== undefined) {
      cal.customConfig = customConfig;
      // Strip PRO features if user and calendar are not PRO
      if (!req.user.isPro && !cal.isPro && cal.customConfig) {
        delete cal.customConfig.logo;
        delete cal.customConfig.logoUrl;
        delete cal.customConfig.firmaColor;
        delete cal.customConfig.firmaBgUrl;
      }
    }
    if (strictMode !== undefined) cal.strictMode = Boolean(strictMode);
    if (randomLayout !== undefined) cal.randomLayout = Boolean(randomLayout);
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200) cal.year = parsedYear;
    }
    return cal;
  });
  if (!updated) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json(toSummary(updated));
});

router.post("/calendars/:id/collaborators", async (req, res) => {
  const { email } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(403).json({ error: "Nur der Besitzer kann Mitbearbeiter einladen." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    if (!cal.collaborators) cal.collaborators = [];
    if (email && !cal.collaborators.includes(email)) {
      cal.collaborators.push(email);
    }
    return cal;
  });
  res.json(toSummary(updated));
});

router.delete("/calendars/:id", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  // Only owner can delete
  if (!calendar || calendar.ownerId !== req.user.id) return res.status(404).json({ error: "Kalender nicht gefunden oder keine Berechtigung." });
  const ok = await db.deleteCalendar(req.params.id);
  if (!ok) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({ ok: true });
});

router.get("/calendars/:id/export-giveaway", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  let csv = "Tag,Email\n";
  calendar.days.forEach(d => {
    if (d.giveawayEntries && d.giveawayEntries.length > 0) {
      d.giveawayEntries.forEach(email => {
        csv += `${d.day},${email}\n`;
      });
    }
  });
  
  res.header('Content-Type', 'text/csv');
  res.attachment('giveaway_teilnehmer.csv');
  res.send(csv);
});

router.post("/calendars/:id/import", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  // simple csv processing: Day,Type,ContentJSON
  const csvText = req.body.csv;
  if (!csvText) return res.status(400).json({ error: "Keine CSV Daten" });

  const lines = csvText.split("\n");
  const updated = await db.updateCalendar(req.params.id, (cal) => {
    lines.forEach(line => {
      const parts = line.split(";");
      if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const type = parts[1].trim();
        let contentStr = parts.slice(2).join(";").trim();
        if (day >= 1 && day <= 24 && CONTENT_TYPES.includes(type)) {
          try {
            const content = JSON.parse(contentStr);
            const idx = cal.days.findIndex(d => d.day === day);
            if (idx !== -1) {
              cal.days[idx].contentType = type;
              cal.days[idx].content = content;
            }
          } catch(e) {}
        }
      }
    });
    return cal;
  });
  res.json({ ok: true });
});

router.post("/calendars/:id/duplicate", async (req, res) => {
  const source = await db.getCalendarById(req.params.id);
  // Only owner can duplicate (or collaborator could, but let's say anyone with access)
  if (!hasAccess(source, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const duplicate = {
    ...source,
    id: generateId(),
    token: generateToken(),
    ownerId: req.user.id, // duplicator becomes new owner
    ownerName: req.user.username,
    collaborators: [], // don't copy collaborators
    recipientName: `${source.recipientName} (Kopie)`,
    createdAt: new Date().toISOString(),
  };
  
  duplicate.days = source.days.map(d => ({
    ...d,
    opened: false,
    openedAt: null,
    content: d.content ? JSON.parse(JSON.stringify(d.content)) : null
  }));

  await db.createCalendar(duplicate);
  res.status(201).json(toSummary(duplicate));
});

router.post("/calendars/:id/swap", async (req, res) => {
  const { dayA, dayB } = req.body || {};
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    const idxA = cal.days.findIndex((d) => d.day === dayA);
    const idxB = cal.days.findIndex((d) => d.day === dayB);
    if (idxA !== -1 && idxB !== -1) {
      const tempType = cal.days[idxA].contentType;
      const tempContent = cal.days[idxA].content;
      cal.days[idxA].contentType = cal.days[idxB].contentType;
      cal.days[idxA].content = cal.days[idxB].content;
      cal.days[idxB].contentType = tempType;
      cal.days[idxB].content = tempContent;
    }
    return cal;
  });
  res.json({ ok: true });
});

router.get("/calendars/:id/preview", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  res.json({
    recipientName: calendar.recipientName,
    ownerName: calendar.ownerName,
    theme: calendar.theme,
    customConfig: calendar.customConfig,
    randomLayout: calendar.randomLayout,
    syncOpen: calendar.syncOpen,
    metaPuzzle: calendar.metaPuzzle,
    playlist: calendar.playlist || [],
    spotifyConnected: Boolean(calendar.spotify?.refreshToken),
    year: calendar.year,
    today: getTodayParts(),
    preview: true,
    days: calendar.days.map((d) => ({
      day: d.day,
      unlockDate: unlockDateISO(calendar.year, d.day),
      unlocked: true,
      filled: Boolean(d.contentType),
      contentType: d.contentType,
      content: d.content,
    })),
  });
});

router.get("/calendars/:id/analytics", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const openings = calendar.days.map(d => ({
    day: d.day,
    opened: d.opened,
    leads: d.giveawayEntries?.length || 0
  }));
  
  res.json({ openings });
});

// ---------- Day content ----------

router.put("/calendars/:id/days/:day", async (req, res) => {
  const dayNum = parseInt(req.params.day, 10);
  if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 24) {
    return res.status(400).json({ error: "Ungültiger Tag (1-24)." });
  }
  const { contentType, content } = req.body || {};
  if (contentType !== null && !CONTENT_TYPES.includes(contentType)) {
    return res.status(400).json({ error: `Ungültiger Inhaltstyp. Erlaubt: ${CONTENT_TYPES.join(", ")}` });
  }

  let finalContent = content || null;
  if (contentType === "qrcode" && finalContent?.data) {
    finalContent = { ...finalContent, qrImage: await generateQrDataUrl(finalContent.data) };
  }

  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const updated = await db.updateCalendar(req.params.id, (cal) => {
    const doorIdx = cal.days.findIndex((d) => d.day === dayNum);
    cal.days[doorIdx] = {
      ...cal.days[doorIdx],
      contentType: contentType || null,
      content: contentType ? finalContent : null,
    };
    return cal;
  });

  res.json(updated.days.find((d) => d.day === dayNum));
});

router.post("/calendars/:id/days/:day/wichtel-link", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!hasAccess(calendar, req.user)) return res.status(404).json({ error: "Kalender nicht gefunden." });

  const dayNum = parseInt(req.params.day, 10);
  let token = null;

  await db.updateCalendar(req.params.id, (cal) => {
    const doorIdx = cal.days.findIndex((d) => d.day === dayNum);
    if (doorIdx !== -1) {
      if (!cal.days[doorIdx].wichtelToken) {
        cal.days[doorIdx].wichtelToken = crypto.randomBytes(8).toString("hex");
      }
      token = cal.days[doorIdx].wichtelToken;
    }
    return cal;
  });

  if (!token) return res.status(400).json({ error: "Ungültiges Türchen." });
  res.json({ token, url: `${config.baseUrl}/wichtel.html?token=${token}` });
});

// ---------- Uploads (gallery images / audio files) ----------

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.paths.uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`);
  },
});

const ALLOWED_MIME = /^(image\/(png|jpe?g|gif|webp)|audio\/(mpeg|mp3|wav|ogg|x-m4a|mp4|webm|weba))$/;

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // increased for voice notes
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.test(file.mimetype)) {
      return cb(new Error("Dateityp nicht erlaubt."));
    }
    cb(null, true);
  },
});

router.post("/upload", async (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Keine Datei erhalten." });
    res.json({ url: `/uploads/${req.file.filename}`, originalName: req.file.originalname });
  });
});

router.post("/calendars/:id/push", async (req, res) => {
  const db = require("../db");
  const { sendPushNotification } = require("../push");
  
  const calendar = await db.getCalendarById(req.params.id);
  if (!calendar) return res.status(404).json({ error: "Kalender nicht gefunden." });
  
  const subs = calendar.subscriptions || [];
  let sent = 0;
  
  for (const sub of subs) {
    try {
      await sendPushNotification(sub, { title: "Kalender Update", body: req.body.message });
      sent++;
    } catch (e) {
      console.error("Push Fehler:", e);
      // Ideally remove stale subscriptions here if e.statusCode === 410 or 404
    }
  }
  
  res.json({ success: true, sent });
});

// Playlist-Eintrag im Admin/Vorschau-Modus (per Kalender-ID)
router.post("/calendars/:id/playlist", async (req, res) => {
  const calendar = await db.getCalendarById(req.params.id);
  if (!calendar || !hasAccess(calendar, req.user)) {
    return res.status(404).json({ error: "Kalender nicht gefunden." });
  }

  const { day, title, artist, trackUri, url, image } = req.body;
  if (!day || !title || !artist) return res.status(400).json({ error: "Missing fields" });

  const updated = await db.updateCalendar(calendar.id, (cal) => {
    if (!cal.playlist) cal.playlist = [];
    cal.playlist.push({ day, title, artist, trackUri: trackUri || null, url: url || null, image: image || null, addedAt: new Date().toISOString() });
    return cal;
  });

  const door = updated.days.find((d) => d.day === Number(day));
  const result = await spotify.addTrackForCalendar(updated, door?.content?.playlistUrl, trackUri, `${title} – ${artist}`);
  if (result.added) {
    await db.updateCalendar(calendar.id, (cal) => {
      const entry = cal.playlist[cal.playlist.length - 1];
      if (entry && entry.trackUri === trackUri) entry.spotifySynced = true;
      return cal;
    });
  }
  res.json({ success: true, spotify: result });
});

module.exports = router;
