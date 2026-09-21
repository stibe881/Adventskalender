/* Ready-made calendars with mixed door types. Each entry is one door:
 * { type, content } – content matches what the editor saves for that type. */

const quiz = (question, options, correctIndex, extra = {}) => ({
  type: "quiz",
  content: { question, options, correctIndex, successMessage: extra.ok || "Richtig!", failMessage: extra.fail || "Leider nicht – versuch es morgen wieder.", prizeText: extra.prize || "" },
});
const text = (message, sender) => ({ type: "text", content: { message, sender } });
const challenge = (task, btnText = "Erledigt!", successMessage = "Super gemacht!") => ({ type: "challenge", content: { task, btnText, successMessage } });
const scratch = (message, revealLabel = "Freirubbeln") => ({ type: "scratchcard", content: { message, revealLabel } });
const choice = (question, optionA, optionB) => ({ type: "choice", content: { question, optionA, optionB } });
const diary = (diaryQuestion) => ({ type: "diary", content: { diaryQuestion } });
const voucher = (title, code, description) => ({ type: "voucher", content: { title, code, description } });
const catcher = (title, targetScore) => ({ type: "catcher", content: { title, targetScore } });
const countdown = (year) => ({ type: "countdown", content: { eventTitle: "Heiligabend", eventDate: `${year}-12-24`, description: "Nur noch einmal schlafen!" } });
const timecapsule = () => ({ type: "timecapsule", content: {} });

/** For children roughly 4 to 10: short tasks, easy quizzes, small games, a few surprises. */
function kidsMix(year) {
  return [
    text("Hallo du! Ich bin's, der Weihnachtsmann. Ab heute wartet jeden Morgen eine kleine Überraschung hinter einem Türchen auf dich. Los geht's – viel Spaß!", "Der Weihnachtsmann"),
    challenge("Finde drei rote Dinge in eurer Wohnung und zeige sie jemandem.", "Gefunden!", "Rot wie die Nase von Rudolph!"),
    quiz("Wie heißt das Rentier mit der roten Nase?", ["Rudolph", "Donner", "Blitz", "Komet"], 0, { ok: "Genau, Rudolph!" }),
    scratch("Was macht ein Schneemann im Sommer? – Er macht Urlaub im Kühlschrank! Rubbel morgen wieder ein Türchen frei.", "Witz freirubbeln"),
    catcher("Fang die Geschenke! Schaffst du 15?", 15),
    text("Heute Nacht war der Nikolaus da. Schau mal in deine Stiefel – und vergiss nicht, dich zu bedanken!", "Der Nikolaus"),
    challenge("Male ein Bild von deinem Lieblingstier mit Weihnachtsmütze und hänge es an den Kühlschrank.", "Bild hängt!", "Ein echtes Kunstwerk!"),
    quiz("Was hängt man an den Weihnachtsbaum?", ["Socken", "Kugeln", "Teller", "Schuhe"], 1, { ok: "Richtig, bunte Kugeln!" }),
    choice("Was ist besser?", "Schlitten fahren", "Schneemann bauen"),
    challenge("Hüpfe zehnmal auf einem Bein und sage dabei laut das Alphabet – so weit du kommst!", "Geschafft!", "Du bist ein Hüpf-Champion!"),
    scratch("Rätsel: Ich habe eine Nase aus Karotte und schmelze in der Sonne. Wer bin ich? – Der Schneemann!", "Antwort freirubbeln"),
    scratch("Ein Schneeflocken-Witz: Was sagt eine Schneeflocke zur anderen? – Lass uns zusammen einen Schneemann bauen!", "Freirubbeln"),
    quiz("Wie viele Türchen hat ein Adventskalender?", ["12", "24", "31", "100"], 1, { ok: "Genau, 24!" }),
    challenge("Singe dein liebstes Weihnachtslied so laut, dass es alle im Haus hören.", "Gesungen!", "Bravo! Zugabe!"),
    diary("Was war heute das Schönste? Male oder schreibe es auf."),
    voucher("Gutschein: Extra-Gute-Nacht-Geschichte", "GESCHICHTE", "Einlösbar an einem Abend deiner Wahl. Du darfst das Buch aussuchen!"),
    quiz("Wer bringt an Heiligabend die Geschenke?", ["Der Osterhase", "Der Weihnachtsmann", "Die Zahnfee", "Der Postbote"], 1, { ok: "Genau!" }),
    challenge("Baue eine Höhle aus Decken und Kissen und lies darin etwas – oder lass dir vorlesen.", "Höhle steht!", "Gemütlich!"),
    scratch("Was sagt der Tannenbaum zum Adventskranz? – Du bist ja ganz schön rund geworden!", "Witz freirubbeln"),
    catcher("Zweite Runde: Fang die Geschenke! Schaffst du 20?", 20),
    choice("Was schmeckt besser?", "Lebkuchen", "Zimtsterne"),
    challenge("Mache heute jemandem in deiner Familie eine Freude: ein Bild, eine Umarmung oder ein liebes Wort.", "Gemacht!", "Das war lieb von dir!"),
    countdown(year),
    text("Frohe Weihnachten! Du hast alle 24 Türchen geöffnet. Ich bin stolz auf dich. Genieße den Abend mit deiner Familie – und schau mal unter den Baum!", "Der Weihnachtsmann"),
  ];
}

/** For couples: love notes, small dates, quizzes about Christmas, vouchers and a letter to next year. */
function coupleMix(year) {
  return [
    text("24 Tage, 24 Türchen, 24 kleine Momente nur für uns. Hinter jedem steckt etwas: ein Gedanke, eine Aufgabe, eine Überraschung. Ich freue mich auf jeden einzelnen Tag mit dir.", "Ich"),
    challenge("Heute Abend: Handy aus, Kerze an, ein Spaziergang zu zweit. Danach heißer Kakao oder Glühwein.", "Waren wir!", "Der erste Abend nur für uns."),
    quiz("Wie viele Rentiere ziehen den Schlitten des Weihnachtsmanns (mit Rudolph)?", ["6", "8", "9", "12"], 2, { ok: "Neun – Rudolph vorneweg!" }),
    scratch("Gutschein: Eine Rückenmassage, 20 Minuten, ohne Gegenleistung. Einlösbar jederzeit.", "Freirubbeln"),
    text("Woran ich heute gedacht habe: an unseren ersten Kuss. Weißt du noch, wo das war?", "Ich"),
    choice("Wochenend-Frage:", "Weihnachtsmarkt", "Filmabend auf dem Sofa"),
    challenge("Kocht heute zusammen etwas, das ihr noch nie gemacht habt. Einer schneidet, einer rührt, beide probieren.", "Gekocht!", "Und? Hat's geschmeckt?"),
    diary("Was schätzt du heute an uns? Schreib es auf – ich lese es später."),
    scratch("Kleiner Gedanke für heute: Die schönsten Geschenke passen in kein Paket – Zeit, Lachen und ein warmes Zuhause.", "Freirubbeln"),
    quiz("Welches Lied wird an Weihnachten weltweit am häufigsten gespielt?", ["Last Christmas", "Jingle Bells", "All I Want for Christmas Is You", "Stille Nacht"], 2, { ok: "Mariah, natürlich." }),
    voucher("Gutschein: Frühstück im Bett", "FRUEHSTUECK", "An einem Wochenende deiner Wahl. Kaffee, Croissant, keine Fragen."),
    challenge("Erzählt euch gegenseitig drei Dinge, die ihr am anderen liebt. Keine Wiederholungen erlaubt.", "Gesagt!", "Drei Gründe mehr."),
    text("Du bist mein Lieblingsmensch. Nicht nur an Weihnachten. Nur damit du es heute wieder liest.", "Ich"),
    catcher("Fang die Geschenke! Wer von uns schafft mehr?", 25),
    scratch("Gutschein: Einmal Abwasch übernehmen, wann immer du willst. Sogar nach dem Fondue.", "Freirubbeln"),
    choice("Heute Abend:", "Zusammen backen", "Zusammen ein Puzzle anfangen"),
    quiz("Seit wann gibt es den Adventskranz ungefähr?", ["Seit dem Mittelalter", "Seit etwa 1840", "Seit 1920", "Seit 1975"], 1, { ok: "Richtig, um 1840 in Hamburg." }),
    challenge("Schaut euch heute alte Fotos von uns an – die ersten gemeinsamen. Sucht euer Lieblingsbild aus.", "Angeschaut!", "Wie jung wir waren."),
    diary("Worauf freust du dich im nächsten Jahr mit mir am meisten?"),
    voucher("Gutschein: Ein Abend ganz nach deinen Wünschen", "DEIN-ABEND", "Du bestimmst Essen, Film und Uhrzeit. Ich sage zu allem ja."),
    text("Fast geschafft. Danke, dass du jeden Tag mit mir aufgemacht hast. Morgen kommt etwas, das bleibt.", "Ich"),
    timecapsule(),
    countdown(year),
    text("Frohe Weihnachten, mein Schatz. 24 Türchen sind vorbei, aber ich habe noch ungefähr tausend Gründe, warum ich dich liebe. Die erzähle ich dir nach und nach – ab morgen.", "Ich"),
  ];
}

const MIXED_TEMPLATES = {
  kids_mix: { label: "Kinder (gemischte Inhalte)", build: kidsMix },
  couple_mix: { label: "Pärchen (gemischte Inhalte)", build: coupleMix },
};

function applyMixedTemplate(days, templateId, year) {
  const t = MIXED_TEMPLATES[templateId];
  if (!t) return false;
  const doors = t.build(year);
  days.forEach((d) => {
    const door = doors[(d.day - 1) % doors.length];
    d.contentType = door.type;
    d.content = JSON.parse(JSON.stringify(door.content));
  });
  return true;
}

module.exports = { MIXED_TEMPLATES, applyMixedTemplate, kidsMix, coupleMix };
