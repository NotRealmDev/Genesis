(function(global){
  "use strict";
  // Exact T-Z entries transcribed from the Ultimate Game Stash Google Doc.
  // Files are served by the same pinned UGS-Web-Hub mirror as the C-S shard.
  const sourceRepository="seanstonator-lang/UGS-Web-Hub";
  const sourceCommit="6f043306b7ae6dc9de5dd6c06b0574952cb2e88e";
  const games=[
  {
    "id": "ugs-doc-cltacostand",
    "name": "Taco Stand",
    "file": "cltacostand.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltabletanks",
    "name": "Table Tanks",
    "file": "cltabletanks.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltabletennisworldtour",
    "name": "Table Tennis World Tour",
    "file": "cltabletennisworldtour.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltag",
    "name": "Tag",
    "file": "cltag-.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltagc3",
    "name": "Also Tag",
    "file": "cltagc3.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltagcm",
    "name": "Tag (coolmathgames)",
    "file": "cltagcm.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltailofthedragon",
    "name": "Tail of The Dragon",
    "file": "cltailofthedragon.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltaisei",
    "name": "Taisei Project",
    "file": "cltaisei.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltallio",
    "name": "Tall.io",
    "file": "cltallio.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltankpixel",
    "name": "Tank Pixel",
    "file": "cltankpixel.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltanukisunset",
    "name": "Tanuki Sunset",
    "file": "cltanukisunset.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltaproad",
    "name": "Tap Road",
    "file": "cltaproad.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltelephonetrouble",
    "name": "Telephone Trouble",
    "file": "cltelephonetrouble.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltemplerun2",
    "name": "Temple Run 2",
    "file": "cltemplerun2.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltempoverdose",
    "name": "TEMPOVERDOSE",
    "file": "cltempoverdose.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clterra",
    "name": "Terra",
    "file": "clterra.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clterritorialio",
    "name": "Territorial.io",
    "file": "clterritorialio.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltzusukimaze",
    "name": "Tzusuki Maze",
    "file": "cltzusukimaze.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthedeadseat",
    "name": "The Deadseat",
    "file": "clthedeadseat.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthedude",
    "name": "The Dude",
    "file": "clthedude.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clteod",
    "name": "The End Of Disney",
    "file": "clteod.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthemaninthewindow",
    "name": "The Man From The Window",
    "file": "clthemaninthewindow.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthereisnofile",
    "name": "There is No Game",
    "file": "clthereisnofile.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthermomorph",
    "name": "Thermomorph",
    "file": "clthermomorph.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clsunandmoon",
    "name": "The Sun and Moon",
    "file": "clsunandmoon.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clvisitor",
    "name": "The Visitor",
    "file": "clvisitor.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltheyarecoming",
    "name": "They Are Coming",
    "file": "cltheyarecoming.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-thiefpuzzle",
    "name": "Thief Puzzle",
    "file": "thiefpuzzle.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthreegoblets",
    "name": "Three Goblets",
    "file": "clthreegoblets.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthrowapotato",
    "name": "Throw a Potato",
    "file": "clthrowapotato.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthrowapotatoagain",
    "name": "Throw a Potato Again",
    "file": "clthrowapotatoagain.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clthwack",
    "name": "Thwack",
    "file": "clthwack.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltimeshooter2",
    "name": "Time Shooter 2",
    "file": "cltimeshooter2.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltimeshooter3",
    "name": "Time Shooter 3",
    "file": "cltimeshooter3.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltimewarriors",
    "name": "Timewarriors",
    "file": "cltimewarriors.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltinyfishing",
    "name": "Tiny Fishing",
    "file": "cltinyfishing.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltoastarling",
    "name": "To a Starling",
    "file": "cltoastarling.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltoasterball",
    "name": "Toasterball",
    "file": "cltoasterball.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltotm",
    "name": "Tomb of the Mask",
    "file": "cltotm.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltommorowandyesterday",
    "name": "Tomorrow And Yesterday",
    "file": "cltommorowandyesterday.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltopspeedracing3d",
    "name": "Top Speed Racing 3D",
    "file": "cltopspeedracing3d.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltowerblocks",
    "name": "Tower Blocks",
    "file": "cltowerblocks.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltowercrash3d",
    "name": "Tower Crash 3D",
    "file": "cltowercrash3d.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltowerwizard",
    "name": "Tower Wizard",
    "file": "cltowerwizard.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltownscraper",
    "name": "Townscraper",
    "file": "cltownscraper.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrace",
    "name": "Trace",
    "file": "cltrace.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrafficjam3d",
    "name": "Traffic Jam 3D",
    "file": "cltrafficjam3d.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltralalerotralalaescapetungtungtungsahur",
    "name": "Tralalero Tralala Escape Tung Tung Tung Sahur",
    "file": "cltralalerotralalaescapetungtungtungsahur.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrappedwithjester",
    "name": "Trapped With Jester",
    "file": "cltrappedwithjester.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrapthecat",
    "name": "Trap The Cat",
    "file": "cltrapthecat.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrechoroustrials",
    "name": "Treacherous Trials",
    "file": "cltrechoroustrials.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltrechoroustrialspart2",
    "name": "Treacherous Trials Part 2",
    "file": "cltrechoroustrialspart2.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltreeshateyou",
    "name": "Trees Hate You",
    "file": "cltreeshateyou.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltriachnid",
    "name": "Triachnid",
    "file": "cltriachnid.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltriviacrack",
    "name": "Trivia Crack",
    "file": "cltriviacrack.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltubejumpers",
    "name": "Tube Jumpers",
    "file": "cltubejumpers.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltungtunghorror",
    "name": "Tung Sahur Horror",
    "file": "cltungtunghorror.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltungtungbasics",
    "name": "Tung Tung Basics (t cubed or t³)",
    "file": "cltungtungbasics.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltungtungtungsahurobby",
    "name": "Tung Tung Tung Sahur Obby",
    "file": "cltungtungtungsahurobby.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltunnelrush",
    "name": "Tunnel Rush",
    "file": "cltunnelrush.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltunnelrushbetter",
    "name": "Better Tunnel Rush",
    "file": "cltunnelrushbetter.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-cltwoball3d",
    "name": "Two Ball 3D",
    "file": "cltwoball3d.html",
    "section": "T"
  },
  {
    "id": "ugs-doc-clufoswampoddysey",
    "name": "Ufo Swamp Odyssey",
    "file": "clufoswampoddysey.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clultimatecardrivingsimulator",
    "name": "Ultimate Car Driving Simulator",
    "file": "clUltimatecardrivingsimulator.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clultrakill",
    "name": "Ultrakill (buggy)",
    "file": "clultrakill.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clucds",
    "name": "Other Car Driving Simulator",
    "file": "clucds.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-cluncannycatgolf",
    "name": "Uncanny Cat Golf",
    "file": "cluncannycatgolf.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clunderneath",
    "name": "Underneath",
    "file": "clunderneath.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clundertalelb",
    "name": "Undertale: Last Breath",
    "file": "clundertalelb.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clundertaleyellow",
    "name": "Undertale Yellow",
    "file": "clundertaleyellow.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clunfairundyne",
    "name": "Unfair Undyne",
    "file": "clunfairundyne.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clunicyclehero",
    "name": "Unicycle Hero",
    "file": "clunicyclehero.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clunitresdreams",
    "name": "Unitres Dreams",
    "file": "clunitresdreams.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-cluno",
    "name": "Uno",
    "file": "cluno.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clunonomercy",
    "name": "Uno No Mercy",
    "file": "clunonomercy.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-cluntime",
    "name": "Untime",
    "file": "cluntime.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clupslash",
    "name": "UpSlash",
    "file": "clupslash.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-cluvuvwevwevweonyetenvewveugwemubwemossas",
    "name": "UvuvwevwevweOnyetenvewveUgwemubwemOssas",
    "file": "clUvuvwevwevweOnyetenvewveUgwemubwemOssas.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-cluzg",
    "name": "UZG",
    "file": "clUZG.html",
    "section": "U"
  },
  {
    "id": "ugs-doc-clvampiresurvivors",
    "name": "Vampire Survivors",
    "file": "clvampiresurvivors.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvaportrails",
    "name": "Vapor Trails",
    "file": "clvaportrails.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex3",
    "name": "Vex 3",
    "file": "clvex3.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex3xmas",
    "name": "Vex 3 Xmas",
    "file": "clvex3xmas.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex4",
    "name": "Vex 4",
    "file": "clvex4.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex5",
    "name": "Vex 5",
    "file": "clvex5.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex6",
    "name": "Vex 6",
    "file": "clvex6.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex7",
    "name": "Vex 7",
    "file": "clvex7.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvex8",
    "name": "Vex 8",
    "file": "clvex8.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvexchallenges",
    "name": "Vex Challenges",
    "file": "clvexchallenges.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvexx3m",
    "name": "Vex x3m",
    "file": "clvexx3m.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvexx3m2",
    "name": "Vex x3m 2",
    "file": "clvexx3m2.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvillager",
    "name": "Villager",
    "file": "clvillager.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvincentmansionofthedead",
    "name": "Vincent Mansion Of The Dead",
    "file": "clvincentmansionofthedead.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvollyballchallenge",
    "name": "Volleyball Challenge",
    "file": "clvollyballchallenge.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvolleyrandom",
    "name": "Volley Random",
    "file": "clvolleyrandom.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clvortex",
    "name": "Vortex",
    "file": "clvortex.html",
    "section": "V"
  },
  {
    "id": "ugs-doc-clwackyflip",
    "name": "Wacky Flip",
    "file": "clwackyflip.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwartheknight",
    "name": "War the Knight",
    "file": "clwartheknight.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwaterpoolio",
    "name": "Waterpool.io",
    "file": "clwaterpoolio.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwaterworks",
    "name": "Waterworks",
    "file": "clwaterworks.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwavedash",
    "name": "Wave Dash",
    "file": "clwavedash.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwaveroad3d",
    "name": "Wave Road 3D",
    "file": "clwaveroad3d.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwaverun",
    "name": "Wave Run",
    "file": "clwaverun.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwebecomewhatwebehold",
    "name": "We Become What We Behold",
    "file": "clwebecomewhatwebehold.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwebfishing",
    "name": "Webfishing",
    "file": "clwebfishing.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwebdashers",
    "name": "Web Dashers",
    "file": "clwebdashers.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwermhole",
    "name": "Wermhole",
    "file": "clwermhole.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwheeliebike",
    "name": "Wheelie Bike",
    "file": "clwheeliebike.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwinterfalling",
    "name": "Winter Falling",
    "file": "clwinterfalling.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwitchcrafttd",
    "name": "Witchcraft td",
    "file": "clwitchcrafttd.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwolfenstein",
    "name": "Wolfenstein 3D Emscripten",
    "file": "clwolfenstein.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwoodworm",
    "name": "Woodworm",
    "file": "clwoodworm.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwordle",
    "name": "Wordle",
    "file": "clwordle.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwrassling",
    "name": "Wrassling",
    "file": "clwrassling.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clwrestlebros",
    "name": "Wrestle Bros",
    "file": "clwrestlebros.html",
    "section": "W"
  },
  {
    "id": "ugs-doc-clxor",
    "name": "Xor",
    "file": "clxor.html",
    "section": "X"
  },
  {
    "id": "ugs-doc-clyanderesimulator",
    "name": "Yandere Simulator",
    "file": "clyanderesimulator.html",
    "section": "Y"
  },
  {
    "id": "ugs-doc-clyohohoio",
    "name": "Yohoho.io",
    "file": "clyohohoio.html",
    "section": "Y"
  },
  {
    "id": "ugs-doc-clyourturntodie",
    "name": "Your Turn To Die",
    "file": "clyourturntodie.html",
    "section": "Y"
  },
  {
    "id": "ugs-doc-clyouvs100skibidi",
    "name": "You vs. 100 Skibidi",
    "file": "clyouvs100skibidi.html",
    "section": "Y"
  },
  {
    "id": "ugs-doc-clyumenikki",
    "name": "Yume Nikki",
    "file": "clyumenikki.html",
    "section": "Y"
  },
  {
    "id": "ugs-doc-clzenword",
    "name": "Zen Word",
    "file": "clzenword.html",
    "section": "Z"
  },
  {
    "id": "ugs-doc-clzombieroad",
    "name": "Zombie Road",
    "file": "clzombieroad.html",
    "section": "Z"
  },
  {
    "id": "ugs-doc-clzombierush",
    "name": "Zombie Rush",
    "file": "clzombierush.html",
    "section": "Z"
  },
  {
    "id": "ugs-doc-clzombotronreboot",
    "name": "Zombotron Reboot",
    "file": "clzombotronreboot.html",
    "section": "Z"
  },
  {
    "id": "ugs-doc-clzrist",
    "name": "Zrist",
    "file": "clzrist.html",
    "section": "Z"
  }
];
  // These filenames are in the Google Doc but are not present in the pinned
  // UGS-Web-Hub tree. They deliberately launch Genesis Mini instead of a
  // broken 404 page until an upstream build becomes available.
  const fallbackFiles=new Set([
    "cltacostand.html",
    "cltagcm.html",
    "cltailofthedragon.html",
    "cltzusukimaze.html",
    "thiefpuzzle.html",
    "cltrappedwithjester.html",
    "cltreeshateyou.html",
    "cltungtunghorror.html",
    "cltungtungbasics.html",
    "clundertalelb.html",
    "clunonomercy.html",
    "clUvuvwevwevweOnyetenvewveUgwemubwemOssas.html",
    "clwackyflip.html",
    "clwaterworks.html",
    "clwaveroad3d.html",
    "clwebdashers.html",
    "clxor.html",
    "clyourturntodie.html"
  ]);
  for(const game of games)game.fallback=fallbackFiles.has(game.file);
  global.GENESIS_GAME_CATALOG_T_Z=Object.freeze({
    sourceRepository,
    sourceCommit,
    fallbackFiles:Object.freeze([...fallbackFiles]),
    games:Object.freeze(games)
  });
})(globalThis);
