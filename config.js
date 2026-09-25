/* Nájemní kniha – konfigurace.
 *
 * Tyto hodnoty jsou ZÁMĚRNĚ prázdné (placeholdery). Nic tajného sem psát
 * nemusíš – appka se tě při prvním spuštění na obě hodnoty zeptá přímo
 * v rozhraní a uloží si je do localStorage daného prohlížeče/telefonu.
 *
 * Pokud je i tak chceš mít napevno v kódu (a commitnout je), vyplň je tady.
 * Hodnoty z localStorage mají vždy přednost před těmito.
 *
 * Návod, kde obě hodnoty vzít, je v README.md.
 */
window.NAJEM_CONFIG = {
  // OAuth 2.0 Client ID z Google Cloud Console, typ "Web application".
  // Vypadá např. takto: "1234567890-abcdefg.apps.googleusercontent.com"
  CLIENT_ID: "",

  // ID Google Sheetu z jeho URL:
  // https://docs.google.com/spreadsheets/d/TADY_JE_ID/edit
  SPREADSHEET_ID: "",

  // Název listu s daty. Měň jen když sis list pojmenoval jinak.
  SHEET_NAME: "Payments",
};
