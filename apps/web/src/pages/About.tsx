import { PageMeta } from "../seo";

const TEAM = [
  { name: "Alex Volt", role: "Founder", bio: "Buys the boring cables so you do not have to." },
  { name: "Mira Chen", role: "Catalog", bio: "Keeps specs honest and photos in focus." },
  { name: "Sami Rautio", role: "Support", bio: "Answers the contact form before the coffee cools." },
];

export function AboutPage() {
  return (
    <article className="prose-page">
      <PageMeta
        title="About — Volt & Co"
        description="Volt & Co is a small electronics shop: honest specs, purchased-only reviews, and checkout that never sees your card number."
      />
      <p className="kicker">The shop</p>
      <h1>About Volt &amp; Co</h1>
      <h2>Company</h2>
      <p>
        Volt &amp; Co is a B2C electronics shop based in Helsinki. We sell headphones, computers,
        phones, wearables, and home tech with the details a buyer actually needs: stock, size in
        both unit systems, and reviews from paying customers.
      </p>
      <h2>Mission</h2>
      <p>
        Make it easy to choose well. No fake scarcity, no card data on our servers, and no reviews
        from people who never opened the box.
      </p>
      <h2>Team</h2>
      <ul className="team-list">
        {TEAM.map((member) => (
          <li key={member.name} className="panel">
            <strong>{member.name}</strong>
            <p className="muted">{member.role}</p>
            <p>{member.bio}</p>
          </li>
        ))}
      </ul>
      <h2>Social</h2>
      <p>
        <a href="https://github.com/volt-and-co" rel="noreferrer">github.com/volt-and-co</a>
        {" · "}
        <a href="mailto:hello@volt.test">hello@volt.test</a>
        {" · "}
        <a href="https://www.instagram.com/voltandco" rel="noreferrer">instagram.com/voltandco</a>
      </p>
    </article>
  );
}
