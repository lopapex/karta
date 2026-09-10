# KARTA

Lokální desktopová aplikace pro psychologickou ordinaci. KARTA spravuje
šifrované karty klientů a jejich šablony bez vzdáleného serveru.

## Bezpečnostní model

- Databáze `karta.db` je šifrovaná SQLCipherem náhodným 256bitovým klíčem.
- Lokální `karta.key` obsahuje databázový klíč zašifrovaný přes AES-256-GCM.
  Šifrovací klíč se odvozuje z hesla KARTA pomocí Argon2id; heslo se neukládá.
- Přenosný export `.karta-backup` je šifrovaný pomocí AES-256-GCM a klíče
  odvozeného z hesla přes Argon2id. Heslo zálohy se neukládá a musí mít
  alespoň 12 znaků.

Původní DPAPI klíč z verze 0.1.0 se na původním účtu Windows jednorázově
převede po vytvoření nového hesla KARTA. Přenosná záloha umožňuje obnovu dat
na jiném počítači a používá vlastní, nezávislé heslo.

## Vývoj

Po otevření nového terminálu v kořeni projektu:

```powershell
nvm use
npm install
npm run tauri dev
```

Vendored OpenSSL vyžaduje Strawberry Perl. Projektová portable instalace
5.42.3.1 je očekávána v `.tools/strawberry-perl-5.42.3.1`; tato velká složka
je ignorovaná Gitem. Skript `npm run tauri` předává Cargo její absolutní cestu,
takže projekt funguje nezávisle na umístění složky. Pro přímé spuštění Cargo
nastavte proměnnou `OPENSSL_SRC_PERL` na úplnou cestu k `perl.exe`.

## Kontroly

```powershell
npm run build
npm run lint
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

Projekt používá Node 24.20.0 a Rust 1.98.1. Verze jsou připnuté v `.nvmrc` a `rust-toolchain.toml`.
