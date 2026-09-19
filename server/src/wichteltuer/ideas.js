/* Idea library for the Christmas elf. Every entry says what to do, how long
 * it takes, what to buy and for which ages it works. Letters use the
 * placeholders {wichtel}, {kinder}, {kind}, {tag}. */

const idea = (id, title, category, o) => ({
  id,
  title,
  category,
  minutes: o.minutes ?? 10,
  effort: o.effort ?? (o.minutes >= 30 ? 3 : o.minutes >= 15 ? 2 : 1),
  materials: o.materials || [],
  prepDayBefore: Boolean(o.prepDayBefore),
  ageMin: o.ageMin ?? 2,
  ageMax: o.ageMax ?? 12,
  weekend: Boolean(o.weekend),
  fixedDay: o.fixedDay || null,
  text: o.text,
  letter: o.letter || null,
});

const IDEAS = [
  // ── Ankunft & Abschied ────────────────────────────────────────────────────
  idea("ankunft", "Der Wichtel zieht ein", "brief", {
    minutes: 15, fixedDay: 1, materials: ["Wichteltür", "Mehl", "Mini-Brief"],
    text: "Die Wichteltür an die Wand kleben, davor mit Mehl winzige Fußspuren tupfen (Fingerspitze) und den Ankunftsbrief hinlegen.",
    letter: "Hallo {kinder}!\n\nIch bin {wichtel} und wohne ab heute hinter dieser kleinen Tür. Nachts, wenn ihr schlaft, bin ich wach – tagsüber schlafe ich tief und fest, bitte klopft nicht.\n\nIch freue mich auf euch!\nEuer {wichtel}",
  }),
  idea("abschied", "Abschiedsbrief und Geschenk", "brief", {
    minutes: 15, fixedDay: 24, materials: ["Mini-Brief", "kleines Abschiedsgeschenk"],
    text: "Am 24. verabschiedet sich der Wichtel: Brief, ein kleines Geschenk und die Tür bleibt danach geschlossen (oder verschwindet).",
    letter: "Liebe {kinder},\n\nheute Nacht reise ich zurück zum Nordpol – der Weihnachtsmann braucht mich. Danke für die schöne Zeit bei euch! Ich habe dem Weihnachtsmann erzählt, wie toll ihr wart.\n\nBis nächstes Jahr!\nEuer {wichtel}",
  }),
  idea("nikolaus", "Nikolaus-Helfer", "geschenk", {
    minutes: 10, fixedDay: 6, materials: ["Schokolade", "Nüsse", "Mandarine"],
    text: "Der Wichtel hat dem Nikolaus geholfen: Neben der Tür steht eine winzige Spur zu den gefüllten Stiefeln.",
    letter: "Psst, {kinder}! Ich habe dem Nikolaus heute Nacht die Tür aufgehalten. Schaut mal in eure Stiefel!\n{wichtel}",
  }),

  // ── Streiche (schnell) ────────────────────────────────────────────────────
  idea("mehlspuren", "Mehlspuren durch die Küche", "streich", {
    minutes: 5, materials: ["Mehl"],
    text: "Mit dem kleinen Finger Fußspuren aus Mehl von der Tür bis zur Keksdose tupfen. Ein Keks fehlt natürlich.",
  }),
  idea("klopapier", "Toilettenpapier-Girlande", "streich", {
    minutes: 10, materials: ["Toilettenpapier"],
    text: "Eine Rolle Toilettenpapier locker durch den Flur oder ums Kinderzimmer wickeln – der Wichtel hat sich ausgetobt.",
  }),
  idea("bilder", "Alle Bilder hängen schief", "streich", {
    minutes: 5, materials: [],
    text: "Bilder an der Wand schief hängen oder auf den Kopf drehen. Ein kleiner Zettel: „War ich das?“",
  }),
  idea("schuhe", "Schuhe vertauscht", "streich", {
    minutes: 5, materials: [],
    text: "Alle Schuhe im Flur paarweise vertauschen, so dass keine zwei gleichen zusammenstehen.",
  }),
  idea("socken", "Socken am Tannenbaum", "streich", {
    minutes: 10, materials: ["Wäscheklammern"],
    text: "Socken der Kinder mit Wäscheklammern an den Baum oder eine Schnur hängen – als „Wichtel-Wäscheleine“.",
  }),
  idea("googly", "Wackelaugen auf allem", "streich", {
    minutes: 10, materials: ["Wackelaugen (selbstklebend)"], prepDayBefore: true,
    text: "Wackelaugen auf Obst, Joghurt, Zahnpasta und die Müslipackung kleben. Am Morgen schaut alles zurück.",
  }),
  idea("milch", "Grüne Milch", "streich", {
    minutes: 3, materials: ["Lebensmittelfarbe grün"],
    text: "Einen Tropfen Lebensmittelfarbe in die Milchflasche oder ins Wasserglas – der Wichtel hat gezaubert.",
  }),
  idea("stuhlturm", "Stühle auf dem Tisch", "streich", {
    minutes: 5, materials: [],
    text: "Alle Stühle auf den Esstisch stellen, der Wichtel sitzt ganz oben mit einem Zettel: „Ich wollte den Baum sehen.“",
  }),
  idea("zahnpasta", "Zahnpasta-Schneemann", "streich", {
    minutes: 5, materials: ["Zahnpasta"],
    text: "Am Waschbecken einen kleinen Schneemann aus Zahnpasta formen, Wattestäbchen als Arme.",
  }),
  idea("tuerklinke", "Tür zugeklebt", "streich", {
    minutes: 5, materials: ["Krepppapier", "Klebeband"],
    text: "Die Kinderzimmertür morgens mit Krepppapier-Streifen „zusperren“, durch die die Kinder durchbrechen dürfen.",
  }),
  idea("kissen", "Kissenschlacht-Spuren", "streich", {
    minutes: 5, materials: [],
    text: "Kissen und Decken im Wohnzimmer verteilen, eine Kissenburg mit dem Wichtel drin.",
  }),
  idea("gegenstaende", "Alles ist vertauscht", "streich", {
    minutes: 10, materials: [],
    text: "Besteck in die Spielzeugkiste, Spielzeug in die Besteckschublade, Zahnbürsten im Kühlschrank.",
  }),
  idea("nasen", "Rote Nasen für alle", "streich", {
    minutes: 5, materials: ["rote Klebepunkte"], prepDayBefore: true,
    text: "Auf alle Familienfotos rote Klebepunkte als Rentiernasen kleben.",
  }),
  idea("schneeball", "Schneeballschlacht", "streich", {
    minutes: 10, materials: ["Watte"],
    text: "Wattebällchen im Wohnzimmer verteilen, der Wichtel mitten drin mit einem Mini-Schneeball in der Hand.",
  }),
  idea("stiefel", "Der Wichtel steckt fest", "streich", {
    minutes: 5, materials: [],
    text: "Den Wichtel kopfüber in einen Stiefel, ein Glas oder die Keksdose stecken – nur die Beine schauen raus.",
  }),
  idea("stromkabel", "Lichterkette umgehängt", "streich", {
    minutes: 10, materials: ["kleine Lichterkette (Batterie)"], prepDayBefore: true,
    text: "Eine Batterie-Lichterkette um die Wichteltür oder ums Kinderbett hängen. Der Wichtel hat dekoriert.",
  }),
  idea("zeitung", "Kinderzeitung vom Nordpol", "brief", {
    minutes: 20, materials: ["Papier", "Drucker"], prepDayBefore: true,
    text: "Eine Mini-Zeitung „Nordpol-Nachrichten“ ausdrucken: Wetter am Nordpol, Rentier-Sport, Keks-Rezept der Woche.",
  }),

  // ── Aufgaben für die Kinder ───────────────────────────────────────────────
  idea("schatzsuche", "Schatzsuche mit Zetteln", "aufgabe", {
    minutes: 20, materials: ["Zettel", "kleine Süßigkeit"], prepDayBefore: true, weekend: true, ageMin: 4,
    text: "Fünf Zettel mit Reimen verstecken, die zum nächsten Ort führen. Am Ende wartet eine Kleinigkeit.",
    letter: "Liebe {kinder}, ich habe etwas versteckt! Der erste Hinweis liegt dort, wo es morgens kalt und weiß ist (im Kühlschrank). Viel Glück!\n{wichtel}",
  }),
  idea("gutetat", "Gute-Tat-Auftrag", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Der Wichtel bittet um eine gute Tat: jemandem helfen, etwas teilen, aufräumen ohne Aufforderung.",
    letter: "{kinder}, heute habe ich eine Bitte: Macht jemandem eine Freude – helft, teilt, sagt etwas Nettes. Ich schaue heute Nacht nach, ob ihr es geschafft habt!\n{wichtel}",
  }),
  idea("bild", "Bild für den Wichtel", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief", "Buntstifte"],
    text: "Der Wichtel wünscht sich ein Bild von seiner Tür oder von sich selbst. Nächste Nacht hängt es „gerahmt“ neben der Tür.",
    letter: "Liebe {kinder}, könnt ihr mir ein Bild malen? Ich habe noch gar keinen Schmuck an meiner Wand.\n{wichtel}",
  }),
  idea("wunschzettel", "Wunschzettel abholen", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief", "Umschlag"],
    text: "Der Wichtel sammelt die Wunschzettel für den Weihnachtsmann ein. Ein Mini-Umschlag liegt bereit.",
    letter: "{kinder}, der Weihnachtsmann fragt, was ihr euch wünscht. Legt eure Wunschzettel in den Umschlag vor meiner Tür, ich nehme sie heute Nacht mit!\n{wichtel}",
  }),
  idea("raetsel", "Rätsel des Tages", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief"], ageMin: 5,
    text: "Ein Rätsel oder Witz auf einem Mini-Zettel. Die Antwort gibt es morgen.",
    letter: "Rätsel für {kinder}: Ich habe einen Bart und komme nur einmal im Jahr, trage Rot und fahre nachts durch die Luft. Wer bin ich? Antwort morgen!\n{wichtel}",
  }),
  idea("tanz", "Wichteltanz", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Der Wichtel fordert zum Tanz auf: Ein Lied wird laut aufgedreht, alle tanzen. Wer zuerst lacht, verliert.",
    letter: "{kinder}, heute ist Tanztag! Dreht euer liebstes Weihnachtslied auf und tanzt für mich. Ich höre hinter der Tür zu.\n{wichtel}",
  }),
  idea("kekse", "Kekse für den Wichtel", "aufgabe", {
    minutes: 5, materials: ["Mini-Teller", "Keks"],
    text: "Der Wichtel bittet um einen Keks vor der Tür. Nachts sind nur noch Krümel da, dazu ein Danke-Zettel.",
    letter: "Hmm, {kinder}, hier riecht es nach Keksen. Stellt ihr mir heute Abend einen vor die Tür? Ich bringe morgen eine Überraschung.\n{wichtel}",
  }),
  idea("aufraeumen", "Aufräum-Wette", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief"], ageMin: 4,
    text: "Der Wichtel wettet, dass das Zimmer bis abends nicht aufgeräumt ist. Wer gewinnt?",
    letter: "{kinder}, ich wette, euer Zimmer ist heute Abend nicht aufgeräumt! Beweist mir das Gegenteil – ich prüfe es heute Nacht.\n{wichtel}",
  }),
  idea("vorlesen", "Vorlese-Abend", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief", "Bilderbuch"],
    text: "Der Wichtel legt ein Weihnachtsbuch vor die Tür und bittet, dass es ihm vorgelesen wird.",
    letter: "{kinder}, ich habe ein Buch mitgebracht. Lest ihr es mir heute Abend vor? Ich höre hinter der Tür zu und schlafe dann ganz tief ein.\n{wichtel}",
  }),
  idea("dankbar", "Dankbarkeits-Zettel", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief", "Zettel"], ageMin: 5,
    text: "Jedes Kind schreibt oder malt, wofür es dankbar ist. Der Wichtel hängt die Zettel als Girlande auf.",
    letter: "{kinder}, am Nordpol machen wir jedes Jahr eine Dankbarkeits-Girlande. Schreibt oder malt, wofür ihr dankbar seid, und legt es vor meine Tür!\n{wichtel}",
  }),
  idea("bewegung", "Wichtel-Sport", "aufgabe", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Ein kleiner Bewegungsparcours: 10 Hampelmänner, 5 Rentier-Sprünge, 1 Mal ums Haus.",
    letter: "{kinder}, Wichtel müssen fit sein! Heute: 10 Hampelmänner, 5 Rentier-Sprünge, einmal um den Tisch laufen. Zeigt mir, wie das geht!\n{wichtel}",
  }),

  // ── Basteln & Backen ──────────────────────────────────────────────────────
  idea("salzteig", "Salzteig-Anhänger", "basteln", {
    minutes: 40, materials: ["Mehl", "Salz", "Ausstechformen", "Band"], weekend: true,
    text: "Der Wichtel hinterlässt Salzteig-Zutaten und ein Rezept. Die Anhänger trocknen bis zum nächsten Tag und werden dann bemalt.",
    letter: "{kinder}, ich habe euch Zutaten für Salzteig mitgebracht: 2 Tassen Mehl, 1 Tasse Salz, 1 Tasse Wasser. Formt Anhänger für den Baum!\n{wichtel}",
  }),
  idea("guetzli", "Guetzli backen", "basteln", {
    minutes: 60, materials: ["Butter", "Zucker", "Mehl", "Eier", "Ausstechformen"], weekend: true, prepDayBefore: true,
    text: "Rezept und Ausstechformen liegen vor der Tür, der Wichtel hat schon eine winzige Schürze um.",
    letter: "{kinder}, heute wird gebacken! Das Rezept liegt vor meiner Tür. Für mich bitte einen Mini-Stern.\n{wichtel}",
  }),
  idea("papiersterne", "Papiersterne falten", "basteln", {
    minutes: 20, materials: ["Butterbrotpapier", "Schere"], ageMin: 5,
    text: "Butterbrotpapier und eine Faltanleitung für Fenstersterne. Der Wichtel hat einen ganz kleinen vorgefaltet.",
  }),
  idea("schneeflocken", "Schneeflocken ausschneiden", "basteln", {
    minutes: 15, materials: ["weißes Papier", "Schere"], ageMin: 4,
    text: "Gefaltetes Papier und Schere: Schneeflocken schneiden und ans Fenster kleben. Der Wichtel hat die erste geschnitten.",
  }),
  idea("wichtelhut", "Wichtelhüte basteln", "basteln", {
    minutes: 20, materials: ["rotes Tonpapier", "Watte", "Kleber"],
    text: "Tonpapier-Kegel als Wichtelhut, Wattebausch obendrauf. Alle tragen ihn beim Abendessen.",
  }),
  idea("futterglocke", "Vogelfutter-Glocke", "basteln", {
    minutes: 25, materials: ["Kokosfett", "Vogelfutter", "Blumentopf oder Tasse", "Schnur"], weekend: true,
    text: "Der Wichtel sorgt sich um die Vögel: Fett schmelzen, Futter einrühren, in Form füllen, aufhängen.",
    letter: "{kinder}, die Vögel frieren! Helft mir, eine Futterglocke zu machen. Die Zutaten liegen bereit.\n{wichtel}",
  }),
  idea("kerze", "Bienenwachskerze rollen", "basteln", {
    minutes: 15, materials: ["Bienenwachsplatten", "Docht"], ageMin: 4,
    text: "Wachsplatten und Docht liegen vor der Tür. Die fertige Kerze brennt beim Abendessen.",
  }),
  idea("lebkuchenhaus", "Lebkuchenhaus verzieren", "basteln", {
    minutes: 45, materials: ["Lebkuchenhaus-Set", "Zuckerguss", "Streusel"], weekend: true, prepDayBefore: true,
    text: "Ein Lebkuchenhaus-Set steht bereit. Der Wichtel hat bereits ein Gummibärchen als Türklinke montiert.",
  }),
  idea("weihnachtskarten", "Karten für Oma und Opa", "basteln", {
    minutes: 25, materials: ["Karten", "Stifte", "Sticker", "Briefmarken"],
    text: "Der Wichtel bringt Karten und Sticker: Weihnachtskarten für Großeltern und Freunde basteln und gemeinsam zur Post bringen.",
  }),
  idea("orangen", "Nelken-Orangen", "basteln", {
    minutes: 15, materials: ["Orangen", "Gewürznelken", "Band"],
    text: "Orangen mit Nelken spicken, es duftet in der ganzen Wohnung. Der Wichtel hat sich eine als Sessel genommen.",
  }),

  // ── Kleinigkeiten ─────────────────────────────────────────────────────────
  idea("schoki", "Schokolade im Schuh", "geschenk", {
    minutes: 3, materials: ["Schokolade"],
    text: "Ein Stück Schokolade in jeden Kinderschuh, dazu Mehlspuren zur Tür.",
  }),
  idea("buch", "Ein neues Buch", "geschenk", {
    minutes: 5, materials: ["Weihnachtsbuch"], prepDayBefore: true,
    text: "Ein Bilder- oder Vorlesebuch liegt eingepackt vor der Tür. Perfekt für einen ruhigen Abend.",
  }),
  idea("socken2", "Kuschelsocken", "geschenk", {
    minutes: 5, materials: ["Kuschelsocken"], prepDayBefore: true,
    text: "Warme Socken, in denen ein Zettel steckt: „Für kalte Wichtelfüße.“",
  }),
  idea("badezusatz", "Zauber-Badebombe", "geschenk", {
    minutes: 5, materials: ["Badebombe"], prepDayBefore: true,
    text: "Eine Badebombe mit Zettel: „Heute Abend wird gezaubert.“ Der Wichtel sitzt auf dem Badewannenrand.",
  }),
  idea("kakao", "Kakao-Kit", "geschenk", {
    minutes: 5, materials: ["Kakaopulver", "Marshmallows", "Zuckerstange"],
    text: "Tassen mit Kakaopulver, Marshmallows und Zuckerstange als Rührstab stehen bereit. Der Wichtel schläft in einer Tasse.",
  }),
  idea("puzzle", "Mini-Puzzle", "geschenk", {
    minutes: 5, materials: ["kleines Puzzle"], prepDayBefore: true, ageMin: 4,
    text: "Ein kleines Puzzle, bei dem der Wichtel ein Teil „verloren“ hat: Es liegt vor seiner Tür.",
  }),
  idea("sticker", "Sticker-Post", "geschenk", {
    minutes: 3, materials: ["Stickerbogen"], prepDayBefore: true,
    text: "Sticker im Mini-Umschlag vor der Tür, mit einem Zettel: „Vom Nordpol, mit Post-Rentier geliefert.“",
  }),
  idea("kino", "Kinoabend", "geschenk", {
    minutes: 10, materials: ["Popcorn", "Eintrittskarte selbst gemacht"], weekend: true,
    text: "Selbstgebastelte Kinokarten für einen Weihnachtsfilm, dazu Popcorn. Der Wichtel sitzt auf der Fernbedienung.",
  }),
  idea("samen", "Kresse säen", "geschenk", {
    minutes: 10, materials: ["Kressesamen", "Watte", "Schale"],
    text: "Der Wichtel bringt Kressesamen: auf feuchte Watte säen, in ein paar Tagen wächst der Wichtel-Wald.",
  }),
  idea("tagesausflug", "Ausflugs-Gutschein", "geschenk", {
    minutes: 5, materials: ["selbst gebastelter Gutschein"], weekend: true,
    text: "Ein Gutschein für Schlittenfahren, Weihnachtsmarkt oder Schwimmbad – vom Wichtel überreicht.",
  }),

  // ── Briefe ────────────────────────────────────────────────────────────────
  idea("brief_heimweh", "Brief: Heimweh nach dem Nordpol", "brief", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Ein Brief, in dem der Wichtel von zu Hause erzählt und die Kinder um ein Foto oder eine Umarmung für die Tür bittet.",
    letter: "Liebe {kinder},\n\nheute habe ich ein bisschen Heimweh nach dem Nordpol. Dort gibt es Polarlichter und meine 42 Geschwister. Erzählt ihr mir heute Abend etwas von euch? Dann geht es mir gleich besser.\n\nEuer {wichtel}",
  }),
  idea("brief_lob", "Brief: Der Wichtel lobt", "brief", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Ein Lobbrief für etwas, das die Kinder wirklich gut gemacht haben (in den Text einsetzen).",
    letter: "{kinder}, ich habe gestern etwas beobachtet, das mir sehr gefallen hat! Das erzähle ich sofort dem Weihnachtsmann.\n\nStolz, euer {wichtel}",
  }),
  idea("brief_entschuldigung", "Brief: Entschuldigung für den Streich", "brief", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Nach einem großen Streich entschuldigt sich der Wichtel und bietet Hilfe beim Aufräumen an (er hat schon angefangen).",
    letter: "{kinder}, es tut mir leid, dass ich gestern so viel Unordnung gemacht habe. Ich habe schon angefangen aufzuräumen … es ist nur so schwer mit meinen kurzen Armen.\n{wichtel}",
  }),
  idea("brief_rentier", "Brief: Nachrichten vom Rentier", "brief", {
    minutes: 5, materials: ["Mini-Brief"],
    text: "Ein Brief mit Neuigkeiten von den Rentieren und einer Frage an die Kinder, welches Rentier ihr Lieblingstier ist.",
    letter: "{kinder}, Neuigkeiten vom Nordpol: Rudolph hat Schnupfen, seine Nase leuchtet doppelt so hell. Welches Rentier mögt ihr am liebsten? Schreibt es mir!\n{wichtel}",
  }),
  idea("brief_krank", "Brief: Wichtel ist erkältet", "brief", {
    minutes: 5, materials: ["Mini-Brief", "Mini-Taschentuch"],
    text: "Der Wichtel liegt mit Erkältung im Bett und bittet um Ruhe – der perfekte Ruhetag für die Eltern.",
    letter: "Hatschi! {kinder}, ich bin erkältet und bleibe heute im Bett. Könnt ihr leise sein und mir vielleicht einen Tee vor die Tür stellen?\n{wichtel}",
  }),
  idea("brief_geschichte", "Fortsetzungsgeschichte", "brief", {
    minutes: 10, materials: ["Mini-Brief"], ageMin: 4,
    text: "Der Wichtel erzählt eine Geschichte in Folgen – jeden zweiten Tag ein neues Kapitel, immer mit Cliffhanger.",
    letter: "Kapitel 1: Wie ich zu euch kam.\n\nEs war eine stürmische Nacht am Nordpol, als der Weihnachtsmann mich rief: „{wichtel}, ich habe eine Aufgabe für dich…“ – Fortsetzung folgt!\n{wichtel}",
  }),

  // ── Ruhetage ──────────────────────────────────────────────────────────────
  idea("ruhe_schlafen", "Der Wichtel schläft aus", "ruhe", {
    minutes: 1, materials: [],
    text: "Nur die Tür ist zu, davor ein Mini-Schild „Bitte nicht stören“. Kein Aufwand, die Kinder erzählen sich selbst Geschichten.",
    letter: "Zzz … {wichtel} schläft. Bitte nicht stören.",
  }),
  idea("ruhe_nordpol", "Dienstreise zum Nordpol", "ruhe", {
    minutes: 2, materials: ["Mini-Brief"],
    text: "Der Wichtel ist für eine Nacht zum Nordpol geflogen und meldet sich morgen mit Neuigkeiten.",
    letter: "{kinder}, ich muss kurz zum Nordpol – Besprechung mit dem Weihnachtsmann. Morgen bin ich zurück!\n{wichtel}",
  }),
  idea("ruhe_lesen", "Der Wichtel liest", "ruhe", {
    minutes: 2, materials: ["Mini-Buch (gefaltetes Papier)"],
    text: "Der Wichtel sitzt mit einem winzigen Buch vor der Tür und liest. Kein Streich, nur ein süßes Bild.",
  }),
];

const byId = Object.fromEntries(IDEAS.map((i) => [i.id, i]));

function fillPlaceholders(text, ctx) {
  const kids = (ctx.children || []).map((c) => c.name).filter(Boolean);
  const kinder = kids.length > 1 ? `${kids.slice(0, -1).join(", ")} und ${kids[kids.length - 1]}` : kids[0] || "Kinder";
  return String(text || "")
    .replace(/\{wichtel\}/g, ctx.elfName || "Euer Wichtel")
    .replace(/\{kinder\}/g, kinder)
    .replace(/\{kind\}/g, kids[0] || "Kind")
    .replace(/\{tag\}/g, ctx.day || "");
}

module.exports = { IDEAS, byId, fillPlaceholders };
