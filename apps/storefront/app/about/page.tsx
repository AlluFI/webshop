import { getTranslator } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

const TEAM = [
  { name: "Alex Volt", role: "about.role.founder" as const, bio: "about.bio.alex" as const },
  { name: "Mira Chen", role: "about.role.catalog" as const, bio: "about.bio.mira" as const },
  { name: "Sami Rautio", role: "about.role.support" as const, bio: "about.bio.sami" as const },
];

export async function generateMetadata() {
  const t = await getTranslator();
  return pageMetadata(`${t("about.title")} — Volt & Co`, t("about.companyBody"));
}

export default async function AboutPage() {
  const t = await getTranslator();
  return (
    <article className="prose-page">
      <p className="kicker">{t("about.kicker")}</p>
      <h1>{t("about.title")}</h1>
      <h2>{t("about.company")}</h2>
      <p>{t("about.companyBody")}</p>
      <h2>{t("about.mission")}</h2>
      <p>{t("about.missionBody")}</p>
      <h2>{t("about.team")}</h2>
      <ul className="team-list">
        {TEAM.map((member) => (
          <li key={member.name} className="panel">
            <strong>{member.name}</strong>
            <p className="muted">{t(member.role)}</p>
            <p>{t(member.bio)}</p>
          </li>
        ))}
      </ul>
      <h2>{t("about.social")}</h2>
      <p>
        <a href="https://github.com/volt-and-co" rel="noreferrer">
          github.com/volt-and-co
        </a>
        {" · "}
        <a href="mailto:hello@volt.test">hello@volt.test</a>
        {" · "}
        <a href="https://www.instagram.com/voltandco" rel="noreferrer">
          instagram.com/voltandco
        </a>
      </p>
    </article>
  );
}
