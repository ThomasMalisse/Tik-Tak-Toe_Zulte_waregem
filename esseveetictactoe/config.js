/*
 * Verbinding met Supabase — nodig voor online spelen.
 *
 * Vul deze twee waarden in met de gegevens van jouw project:
 *   Supabase -> Project Settings -> Data API  (of "API")
 *
 * Laat je ze leeg, dan werkt het spel gewoon door; de knop "Samen online
 * spelen" is dan uitgeschakeld met een uitleg erbij.
 *
 * -------------------------------------------------------------------------
 * "Mag die sleutel zomaar in de broncode staan?"
 *
 * Ja. De anon-sleutel is publiek bedoeld: iedereen die de pagina opent kan
 * hem uit de broncode lezen, en dat is geen probleem. De beveiliging zit in
 * Row Level Security in de database, niet in het geheimhouden van dit stukje
 * tekst. Zie supabase/schema.sql en SECURITY.md.
 *
 * Wat NOOIT hier mag staan is de service_role-sleutel. Die omzeilt alle RLS
 * en hoort alleen op een server thuis.
 * -------------------------------------------------------------------------
 */

const SUPABASE_URL = "https://litucwiokacmhxyopnbz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpdHVjd2lva2FjbWh4eW9wbmJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczMTcxNjQsImV4cCI6MjEwMjg5MzE2NH0.yGkIZiNpVwzqN8nO30EJwBm1BNTl-Fb3dfktuh8qBu4";

const ONLINE_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
