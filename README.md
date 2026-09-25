# Nájemní kniha

Sdílený deník plateb nájmu mezi pronajímatelem a podnájemníkem. Každý měsíc je
jeden záznam a platí za uzavřený, teprve když ho **samostatně potvrdí obě
strany**.

Čisté HTML/CSS/JS – žádný framework, žádný build step, žádný backend server.
Data leží v jednom Google Sheetu, do kterého appka přistupuje přímo z prohlížeče
přes Google Sheets API. Funguje jako PWA (přidání na plochu Androidu) i v
prohlížeči na PC.

---

## Obsah repozitáře

| Soubor | K čemu je |
|---|---|
| `index.html` | celé rozhraní |
| `styles.css` | vzhled, světlý i tmavý režim |
| `app.js` | logika appky, role, vykreslování |
| `sheets.js` | přihlášení (GIS) + volání Google Sheets API |
| `config.js` | Client ID a ID tabulky – v repu prázdné, vyplňuje se v appce |
| `manifest.json`, `sw.js`, `icons/` | PWA (ikony, offline shell) |
| `.nojekyll` | řekne GitHub Pages, ať soubory nepropouští přes Jekyll |

---

## Nastavení krok za krokem

Celé to zabere zhruba 15 minut. Body 1–3 dělá **jen pronajímatel** (majitel
Google Cloud projektu), bod 6 pak každý na svém telefonu.

### 1. Google Cloud projekt a OAuth Client ID

1. Otevři <https://console.cloud.google.com/> a přihlas se svým Google účtem.
2. Nahoře v liště klikni na výběr projektu → **New project**. Pojmenuj ho třeba
   `najemni-kniha` a dej **Create**. Počkej, až se přepne do nového projektu.
3. V levém menu jdi na **APIs & Services → OAuth consent screen** (v novějším
   rozhraní **Google Auth Platform → Branding**).
   - User type: **External**, dej **Create**.
   - App name: `Nájemní kniha`, User support email: tvůj e-mail,
     Developer contact: tvůj e-mail. Ulož a proklikej se dál.
   - V sekci **Audience** nech appku ve stavu **Testing** a v **Test users**
     přidej **oba** Google účty (svůj i podnájemníkův). Bez toho se
     podnájemník nepřihlásí.
   - V sekci **Data Access / Scopes** nemusíš nic přidávat – appka si scope
     vyžádá sama při přihlášení.
4. Jdi na **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**
   - Name: `Nájemní kniha web`
   - **Authorized JavaScript origins**: zatím přidej `http://localhost:8000`
     (na lokální testování). Finální adresu GitHub Pages sem doplníš v kroku 5.
   - **Authorized redirect URIs** nech prázdné – appka používá token client,
     žádné přesměrování nepotřebuje.
   - Dej **Create**. Zkopíruj si **Client ID** (končí na
     `.apps.googleusercontent.com`). **Client secret ignoruj**, ten tahle
     appka nepoužívá a nikam ho nedávej.

> Ve stavu *Testing* ukáže Google při prvním přihlášení varování „Google hasn't
> verified this app“ – dej **Advanced → Go to Nájemní kniha (unsafe)**. Je to
> tvoje vlastní appka, je to v pořádku. (Známé omezení *Testing* režimu, že
> přihlášení vyprší po 7 dnech, se týká refresh tokenů – ty tahle appka vůbec
> nepoužívá, takže se jí netýká.)

### 2. Povolit Google Sheets API

1. V tom samém projektu jdi na **APIs & Services → Library**.
2. Najdi **Google Sheets API** → **Enable**.

Bez tohohle kroku bude appka hlásit „Nemáš přístup k tabulce“.

### 3. Vytvořit Google Sheet

1. Otevři <https://sheets.google.com> a vytvoř novou tabulku, pojmenuj ji třeba
   `Nájemní kniha – data`.
2. Přejmenuj list dole vlevo (výchozí „List1“ / „Sheet1“) na přesně
   **`Payments`**.
3. Do prvního řádku napiš hlavičku – každý název do svého sloupce A až J:

   | A | B | C | D | E | F | G | H | I | J |
   |---|---|---|---|---|---|---|---|---|---|
   | `id` | `monthKey` | `amount` | `note` | `landlordConfirmed` | `landlordConfirmedAt` | `tenantConfirmed` | `tenantConfirmedAt` | `createdAt` | `createdBy` |

   Hlavička je jen pro tvoje oči – appka vždy čte od řádku 2 dolů. Nepřidávej
   nad ni další řádky.
4. **Zjisti spreadsheet ID** z adresního řádku. URL vypadá takto:

   ```
   https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0
                                          └──────────── tohle je ID ────────────┘
   ```

   (Do appky můžeš vložit i celou URL, ID si z ní vytáhne sama.)

### 4. Nasdílet tabulku podnájemníkovi

V tabulce vpravo nahoře **Share / Sdílet** → vlož Google e-mail podnájemníka →
role **Editor** → odeslat. Necháš ji jinak na „Restricted“ – nikdo další se k
datům nedostane.

> **Tohle je jediná věc, která data chrání.** Kdo nemá Sheet nasdílený,
> nepřečte v appce nic, i kdyby se do ní přihlásil.

### 5. Nasadit na GitHub Pages

1. Nahraj obsah téhle složky do GitHub repozitáře (soubory v **rootu**, ne ve
   vnořené složce):

   ```bash
   git init
   git add .
   git commit -m "Nájemní kniha"
   git branch -M main
   git remote add origin https://github.com/ArticlessCZ-Coder/najemni-kniha.git
   git push -u origin main
   ```

2. V repu na GitHubu jdi na **Settings → Pages**.
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, složka `/ (root)` → **Save**
   - (Kdybys soubory dal do podsložky `docs/`, vyber složku `/docs`.)
3. Počkej minutu a nahoře na té samé stránce se objeví hláška
   *„Your site is live at …“* s výslednou URL. Má tvar:

   ```
   https://articlesscz-coder.github.io/najemni-kniha/
   ```

   Repo musí být **Public** (u free účtu Pages na privátním repu nefungují).
4. **Vrať se do Google Cloud Console** → **Credentials** → tvůj OAuth client →
   do **Authorized JavaScript origins** přidej **jen origin bez cesty**:

   ```
   https://articlesscz-coder.github.io
   ```

   (Ne celou adresu s `/najemni-kniha/` – Google tam cestu nepřijme.)
   Ulož. Změna se někdy projeví až po pár minutách.

   > Pozor na **malá písmena**: uživatelské jméno je `ArticlessCZ-Coder`, ale
   > doména `github.io` se vždycky servíruje malými písmeny a prohlížeč si
   > hostname stejně zmenší. Do Google Cloud patří přesně
   > `https://articlesscz-coder.github.io`.

### 6. První spuštění na telefonu

Tohle udělá každý na svém zařízení:

1. Otevři adresu appky v **Chrome** na Androidu.
2. Appka se zeptá na **Client ID** a **ID tabulky** – vlož je (pošli je
   podnájemníkovi třeba zprávou, není to nic tajného). Uloží se do
   localStorage toho prohlížeče.
3. Vyber **roli**: *Pronajímatel* / *Podnájemník*. Platí jen pro tohle
   zařízení a určuje, kterou stranu můžeš potvrzovat. Později se mění přes
   ⚙ v hlavičce.
4. **Přihlas se Google účtem** – tím, který má tabulku nasdílenou.
5. Menu Chrome (⋮) → **Přidat na plochu / Instalovat aplikaci**. Appka pak
   běží v samostatném okně bez adresního řádku.

Na PC je to stejné, jen krok 5 vynecháš (nebo použiješ ikonu instalace v
adresním řádku Chrome).

#### Co musí udělat podnájemník

**Nic v Google Cloud Console.** Ta je čistě věc vlastníka projektu. Podnájemník
jen otevře URL appky, vloží Client ID a Sheet ID (pošli mu je zprávou, nejsou
tajné), vybere roli *Podnájemník* a proklikne přihlašovací popup od Google.

Aby mu přihlášení prošlo, musíš ty jednorázově zajistit dvě věci:

1. jeho Google e-mail je v **Test users** na OAuth consent screenu (krok 1),
2. má **Sheet nasdílený jako Editor** (krok 4).

Bez prvního ho Google odmítne s „access blocked / app not verified“, bez
druhého se přihlásí, ale appka mu ukáže „Nemáš přístup k tabulce“.

#### Jak přihlášení vypadá

Appka používá standardní Google popup s výběrem účtu – ten samý, jaký znáš z
jiných webů. Při startu se nejdřív zkouší tiché přihlášení (`prompt: 'none'`),
takže když už máš v prohlížeči Google session a jednou jsi přístup povolil,
naskočí appka rovnou bez okna. Popup se otevře jen tehdy, když je opravdu
potřeba – a vždy až po kliknutí na tlačítko, aby ho neblokoval blokátor
vyskakovacích oken.

### Lokální testování

```bash
python -m http.server 8000
```

a otevři <http://localhost:8000>. Musí to být přes HTTP server, ne otevření
souboru přes `file://` – Google přihlášení ani service worker by nefungovaly.

---

## Jak appku používat

- **Nový záznam** – vyber měsíc, volitelně částku a poznámku (max 80 znaků).
  Zapsat může kdokoli z obou stran.
- **Potvrzuji** – tlačítko je jen u tvojí strany. Za druhého potvrzovat nejde.
  Appka si před zápisem vždy znovu načte aktuální stav tabulky, aby nepřepsala
  to, co mezitím udělal ten druhý.
- **Potvrzeno oběma** – zelený pruh a zelená pilulka. Nahoře se pak počítá do
  statistiky včetně součtu potvrzených částek.
- **Smazání** – první klik na *Smazat* se přepne na *Opravdu smazat?*, teprve
  druhý klik řádek z tabulky opravdu odstraní. Po 4 vteřinách nečinnosti se
  tlačítko vrátí zpátky.
- **⟳** v hlavičce načte data znovu. Appka je osvěží i sama, kdykoli se k ní
  vrátíš na popředí.

### Offline

Bez internetu se rozhraní načte ze service workeru a nahoře je žlutý pruh
*„Jsi offline – data se nedají synchronizovat.“* Zápisy se nefrontují – co
neprošlo, musíš po připojení zadat znovu. Pro dva lidi a jeden záznam měsíčně
je to záměrně jednoduché.

### Sloupce v tabulce

| Sloupec | Význam |
|---|---|
| `id` | vygenerované v prohlížeči (časové razítko + náhoda) |
| `monthKey` | měsíc ve tvaru `YYYY-MM` |
| `amount` | částka v Kč, může být prázdná |
| `note` | poznámka, může být prázdná |
| `landlordConfirmed` / `tenantConfirmed` | `TRUE` / `FALSE` |
| `landlordConfirmedAt` / `tenantConfirmedAt` | ISO datum a čas potvrzení |
| `createdAt` | ISO datum a čas vytvoření |
| `createdBy` | `landlord` / `tenant` |

Hodnoty klidně uprav přímo v Sheetu – appka si je při dalším načtení přečte.
Jen neměň sloupec `id` a nevkládej řádky nad hlavičku.

---

## Poznámka k oprávněním (scope)

Appka žádá scope `https://www.googleapis.com/auth/spreadsheets`, tedy čtení a
zápis do **všech** Google Sheetů přihlášeného účtu. Prakticky to znamená: když
se podnájemník přihlásí, dává téhle appce (ne tobě) technickou možnost sáhnout
i na jeho ostatní tabulky. Appka to nedělá – v kódu je natvrdo jediné
spreadsheet ID – ale je fér o tom vědět.

Užší alternativa je `drive.file`, kde appka vidí jen soubory, které v ní
uživatel sám vybral přes Google Picker. Znamenalo by to navíc API key, druhou
knihovnu a jeden extra proklik na **každém** zařízení. Pro appku mezi dvěma
lidmi, kteří si navzájem důvěřují, to za tu složitost nestojí – proto je tady
`spreadsheets`.

---

## Bezpečnost – co appka chrání a co ne

**Client ID v kódu je v pořádku.** OAuth Client ID není heslo ani tajemství –
je to veřejný identifikátor appky, který Google vidí při každém přihlášení a
který se v prohlížeči nedá schovat. Zneužít se nedá, protože Google přijme
přihlášení jen z domén uvedených v *Authorized JavaScript origins*. Tajný je
jen *client secret*, a ten tahle appka vůbec nepoužívá (je to čistě klientský
„public client“, přesně pro tenhle případ určený).

**Data chrání sdílení Google Sheetu, ne appka.** Kdokoli otevře URL appky a
přihlásí se svým Google účtem, dostane token – ale Sheets API mu vrátí data jen
tehdy, když *jeho účet* má tu konkrétní tabulku nasdílenou. Cizí člověk uvidí
prázdnou appku a hlášku „Nemáš přístup k tabulce“. Přístup k datům se tedy řeší
v Google Sheets přes **Share**, ne v kódu.

**Přesto URL appky nesdílej veřejně.** Nic to sice neprozradí, ale není důvod
zvát cizí lidi, aby se do vašeho deníku pokoušeli přihlásit – a hlavně ve stavu
*Testing* je seznam povolených účtů omezený a zbytečně se v logách projektu
objevují cizí pokusy. Repozitář sám o sobě veřejný být může, žádná citlivá data
v něm nejsou.

**Co v repu nikdy nesmí skončit:** client secret, service account klíč, export
dat z tabulky. Nic z toho appka nepotřebuje.

---

## Když něco nefunguje

| Hláška / příznak | Co s tím |
|---|---|
| „Přihlášení se nepodařilo“ | Origin v Google Cloud nesedí. Musí tam být přesně `https://articlesscz-coder.github.io` bez lomítka a cesty. Počkej pár minut, změna se propisuje se zpožděním. |
| „Nemáš přístup k tabulce“ | Buď není povolené **Google Sheets API**, nebo přihlášený účet nemá Sheet nasdílený jako Editor. |
| „Tabulka nenalezena“ | Špatné spreadsheet ID – ⚙ → *Změnit připojení k tabulce*. |
| „List se nenašel“ | List v tabulce se nejmenuje `Payments` (rozlišují se velká a malá písmena). |
| „Přihlášení vypršelo“ | Token platí hodinu. Klikni znovu na přihlášení. |
| Appka se po nasazení nemění | Service worker drží starou verzi. Zvyš `CACHE_VERSION` v `sw.js` a commitni, nebo appku na telefonu zavři a znovu otevři. |
| Google varuje „hasn't verified this app“ | Očekávané ve stavu *Testing*: **Advanced → Go to … (unsafe)**. |
