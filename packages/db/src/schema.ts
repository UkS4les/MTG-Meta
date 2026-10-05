/**
 * Migrações em ordem. Cada item roda uma única vez; para mudar o esquema, acrescente um item
 * no fim (nunca edite um que já foi aplicado). SQL de Postgres puro, para valer também no
 * Supabase ou no Neon.
 */
export const MIGRATIONS: readonly string[] = [
  `
  create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    password_hash text not null,
    created_at timestamptz not null default now()
  );

  create table sessions (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null
  );
  create index sessions_user on sessions(user_id);

  -- Papel e Arena são coleções separadas do mesmo usuário.
  create table collections (
    user_id uuid not null references users(id) on delete cascade,
    platform text not null check (platform in ('arena', 'paper')),
    card_name text not null,
    quantity integer not null check (quantity > 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, platform, card_name)
  );

  create table archetypes (
    id serial primary key,
    format text not null,
    name text not null,
    -- Carta → média de cópias nas listas (só não-terrenos do main).
    signature jsonb not null,
    -- true enquanto o nome é o sugerido pelo classificador; false depois de alguém nomear.
    auto_named boolean not null default true,
    sample_deck_id integer,
    created_at timestamptz not null default now(),
    unique (format, name)
  );

  create table decks (
    id serial primary key,
    -- SHA-256 da lista ordenada: o mesmo deck em dois torneios vira uma linha só.
    hash text not null unique,
    format text not null,
    platform text not null,
    archetype_id integer references archetypes(id) on delete set null,
    archetype_score real,
    source text not null,
    created_at timestamptz not null default now()
  );
  create index decks_format on decks(format, archetype_id);

  create table deck_cards (
    deck_id integer not null references decks(id) on delete cascade,
    board text not null check (board in ('main', 'side', 'commander')),
    card_name text not null,
    quantity integer not null check (quantity > 0),
    primary key (deck_id, board, card_name)
  );

  create table events (
    id text primary key,
    source text not null,
    name text not null,
    format text not null,
    date date not null,
    url text not null,
    players integer
  );
  create index events_format_date on events(format, date);

  create table event_results (
    event_id text not null references events(id) on delete cascade,
    player_handle text not null,
    deck_id integer not null references decks(id) on delete cascade,
    placement integer,
    wins integer,
    losses integer,
    url text,
    primary key (event_id, player_handle, deck_id)
  );
  create index event_results_deck on event_results(deck_id);

  -- Pré-calculado pelo job; as páginas de meta leem daqui. archetype_id nulo = decks sem arquétipo.
  create table meta_snapshots (
    format text not null,
    platform text not null,
    period_days integer not null,
    archetype_id integer references archetypes(id) on delete cascade,
    decks integer not null,
    share real not null,
    updated_at timestamptz not null default now()
  );
  create index meta_snapshots_lookup on meta_snapshots(format, platform, period_days);

  -- Arquivos da fonte já lidos, para não baixar de novo o que não mudou.
  create table ingest_files (
    path text primary key,
    sha text not null,
    ingested_at timestamptz not null default now()
  );
  `,
  `
  -- Partidas do Arena lidas do Player.log. Não há coluna para nome ou identificador do oponente:
  -- do outro lado da mesa ficam só as cartas que ele mostrou.
  create table matches (
    user_id uuid not null references users(id) on delete cascade,
    match_id text not null,
    event_id text not null,
    started_at timestamptz,
    result text not null check (result in ('win', 'loss', 'draw')),
    games_won integer not null,
    games_lost integer not null,
    on_play boolean,
    deck_name text,
    -- { main, sideboard, commander }: listas de { name, quantity }.
    deck jsonb,
    deck_archetype_id integer references archetypes(id) on delete set null,
    -- Nomes das cartas que o oponente mostrou.
    opponent_cards jsonb not null default '[]',
    opponent_archetype_id integer references archetypes(id) on delete set null,
    opponent_confidence real,
    created_at timestamptz not null default now(),
    primary key (user_id, match_id)
  );
  create index matches_user_date on matches(user_id, started_at desc);
  `,
  `
  -- Chave do programa que acompanha o Arena: deixa enviar partidas sem a senha da conta.
  -- Uma por pessoa; gerar outra invalida a anterior. Só o hash fica guardado.
  create table api_tokens (
    user_id uuid primary key references users(id) on delete cascade,
    token_hash text not null unique,
    created_at timestamptz not null default now(),
    last_used_at timestamptz
  );
  `,
  `
  -- Decks criados pela própria pessoa no site.
  create table user_decks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    name text not null,
    format text,
    -- Listas de { name, quantity }.
    main jsonb not null,
    sideboard jsonb not null default '[]',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index user_decks_user on user_decks(user_id, updated_at desc);
  `,
];
