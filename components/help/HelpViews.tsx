// S242/S243: the rendered help pages. Server components over the repository content model; they
// read nothing from Firestore or a provider and issue no write. Every guide shows the help
// version, its last updated date and the serving release it describes.
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { HelpPrintButton } from "@/components/help/HelpPrintButton";
import { HelpStepTarget } from "@/components/help/HelpStepTarget";
import { formatCalendarDate } from "@/lib/date-display";
import {
  HELP_GLOSSARY,
  HELP_GUIDES,
  HELP_SCREEN_REFERENCES,
  guidesInSection,
  helpGuideById,
  helpScreen,
  helpSection,
} from "@/lib/help";
import { HELP_CHANGELOG } from "@/lib/help/content/changelog";
import { helpScene } from "@/lib/help/scenes";
import {
  HELP_GLOSSARY_HREF,
  HELP_PRINT_HREF,
  HELP_REFERENCE_HREF,
  HELP_WHAT_CHANGED_HREF,
  helpControlAnchor,
  helpGuideHref,
  helpScreenHref,
  helpSectionHref,
} from "@/lib/help/links";
import { HELP_SECTIONS } from "@/lib/help/sections";
import { shortCommit } from "@/lib/help/serving-release";
import type {
  HelpControlRole,
  HelpGuide,
  HelpScreenReference,
  HelpSection,
  HelpStep,
  HelpStepEffect,
} from "@/lib/help/types";
import { HELP_ASSET_ROOT, HELP_VERSION } from "@/lib/help/version";

export const HELP_PRODUCT_TITLE = "PMI KC staff help";

const EFFECT_TEXT: Readonly<Record<HelpStepEffect, string>> = {
  reads: "Reads only. Nothing is saved or changed.",
  "saves-in-app":
    "Saves in the app. RentVine, the operating Sheet and Dotloop do not change.",
  copies: "Copies or opens. Nothing is saved or sent.",
  "unsent-draft": "Creates an unsent draft after your confirmation. Nothing is sent.",
  "exact-confirmation": "Changes the source only after your exact confirmation.",
  "explicit-send": "Sends only after your explicit Send or Schedule.",
};

const ROLE_TEXT: Readonly<Record<HelpControlRole, string>> = {
  article: "panel",
  button: "button",
  checkbox: "checkbox",
  columnheader: "column",
  combobox: "list box",
  complementary: "side panel",
  dialog: "dialog",
  group: "group",
  heading: "heading",
  img: "picture",
  label: "field",
  link: "link",
  list: "list",
  navigation: "navigation",
  option: "option",
  phase: "phase link",
  radio: "choice",
  region: "section",
  row: "row",
  status: "status line",
  summary: "disclosure",
  switch: "switch",
  tab: "tab",
  table: "table",
  textbox: "text box",
};

export function helpEffectText(effect: HelpStepEffect) {
  return EFFECT_TEXT[effect];
}

export function helpRoleText(role: HelpControlRole) {
  return ROLE_TEXT[role];
}

/** Version, date and release line shown on every guide and reference page. */
export function HelpMeta({
  lastUpdated,
  servingCommit,
  audience,
  adminOnly,
}: Readonly<{
  lastUpdated: string;
  servingCommit: string | null;
  audience?: string;
  adminOnly?: boolean;
}>) {
  return (
    <p className="help-meta">
      <span>Help {HELP_VERSION}</span>
      <span>Last updated {formatCalendarDate(lastUpdated)}</span>
      <span>
        Describes app release{" "}
        {servingCommit ? (
          <code title={servingCommit}>{shortCommit(servingCommit)}</code>
        ) : (
          "not reported by this server"
        )}
      </span>
      {audience ? <span>For {audience}</span> : null}
      {adminOnly ? <span className="help-admin-label">Admin</span> : null}
    </p>
  );
}

/** Per-page print footer: help version, title and page number on every printed page. */
export function HelpPrintFooter({ title }: Readonly<{ title: string }>) {
  const label = `${HELP_PRODUCT_TITLE} ${HELP_VERSION} · ${title}`.replace(/["\\]/g, "");
  return (
    <style>{`@page { @bottom-left { content: "${label}"; } @bottom-right { content: "Page " counter(page); } }`}</style>
  );
}

function SceneFigure({ sceneId }: Readonly<{ sceneId: string }>) {
  const scene = helpScene(sceneId);
  if (!scene) return null;
  return (
    <figure className="help-figure">
      {/* Eager, not lazy: a printed guide or the whole manual must carry every picture, and a
          lazy image below the fold is never fetched by a print that does not scroll to it. */}
      <Image
        alt={scene.alt}
        className="help-figure-image"
        height={scene.viewport.height}
        loading="eager"
        src={`${HELP_ASSET_ROOT}/${scene.id}.png`}
        unoptimized
        width={scene.viewport.width}
      />
      <figcaption>{scene.caption}</figcaption>
    </figure>
  );
}

export function HelpStepItem({
  step,
  index,
  headingLevel = 3,
}: Readonly<{ step: HelpStep; index: number; headingLevel?: 3 | 4 }>) {
  const Heading = headingLevel === 3 ? "h3" : "h4";
  return (
    <li className="help-step" id={step.id}>
      <Heading className="help-step-title">
        Step {index + 1}. {step.action}
      </Heading>
      <dl className="help-step-facts">
        <div>
          <dt>Control</dt>
          <dd>
            <strong>{step.control.label}</strong> {helpRoleText(step.control.role)}
            {step.control.availability === "conditional" ? (
              <span className="help-step-conditional"> (shown when it applies)</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd>
            {step.where} <code className="help-route">{step.route}</code>
          </dd>
        </div>
        <div>
          <dt>What you see</dt>
          <dd>{step.result}</dd>
        </div>
        <div>
          <dt>What it changes</dt>
          <dd>{helpEffectText(step.effect)}</dd>
        </div>
      </dl>
      {step.note ? <p className="help-step-note">{step.note}</p> : null}
      {step.scene ? <SceneFigure sceneId={step.scene} /> : null}
    </li>
  );
}

export function HelpGuideBody({
  guide,
  servingCommit,
  headingLevel = 1,
}: Readonly<{ guide: HelpGuide; servingCommit: string | null; headingLevel?: 1 | 2 }>) {
  const section = helpSection(guide.section);
  const Title = headingLevel === 1 ? "h1" : "h2";
  const Sub = headingLevel === 1 ? "h2" : "h3";
  return (
    <article aria-labelledby={`guide-${guide.id}`} className="help-guide">
      <header className="help-guide-header">
        <p className="help-kicker">{section?.title}</p>
        <Title id={`guide-${guide.id}`}>{guide.title}</Title>
        <HelpMeta
          adminOnly={guide.adminOnly}
          audience={guide.audience}
          lastUpdated={guide.lastUpdated}
          servingCommit={servingCommit}
        />
      </header>
      <p className="help-purpose">{guide.purpose}</p>
      {guide.prerequisites.length ? (
        <section aria-label={`Before you start: ${guide.title}`}>
          <Sub>Before you start</Sub>
          <ul>
            {guide.prerequisites.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section aria-label={`Steps: ${guide.title}`}>
        <Sub>Steps</Sub>
        <ol className="help-steps">
          {guide.steps.map((step, index) => (
            <HelpStepItem
              headingLevel={headingLevel === 1 ? 3 : 4}
              index={index}
              key={step.id}
              step={step}
            />
          ))}
        </ol>
      </section>
      <section aria-label={`Result: ${guide.title}`}>
        <Sub>Result</Sub>
        <p>{guide.result}</p>
      </section>
      <section aria-label={`What this does not do: ${guide.title}`}>
        <Sub>What this does not do</Sub>
        <ul>
          {guide.doesNotDo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      {guide.relatedGuides.length || guide.relatedScreens.length ? (
        <section aria-label={`Related: ${guide.title}`} className="help-related">
          <Sub>Related</Sub>
          <ul>
            {guide.relatedGuides.map((id) => {
              const related = helpGuideById(id);
              return related ? (
                <li key={id}>
                  <Link
                    href={helpGuideHref(related.section, related.id)}
                    prefetch={false}
                  >
                    {related.title}
                  </Link>
                </li>
              ) : null;
            })}
            {guide.relatedScreens.map((id) => {
              const screen = helpScreen(id);
              return screen ? (
                <li key={id}>
                  <Link href={helpScreenHref(screen.id)} prefetch={false}>
                    Screen reference: {screen.title}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export function HelpGuidePage({
  guide,
  servingCommit,
}: Readonly<{ guide: HelpGuide; servingCommit: string | null }>) {
  return (
    <>
      <HelpPrintFooter title={guide.title} />
      <HelpStepTarget stepIds={guide.steps.map((step) => step.id)} />
      <div className="help-page-actions help-print-hide">
        <HelpPrintButton label="Print this guide" />
      </div>
      <HelpGuideBody guide={guide} servingCommit={servingCommit} />
    </>
  );
}

export function HelpScreenBody({
  screen,
  servingCommit,
  headingLevel = 1,
}: Readonly<{
  screen: HelpScreenReference;
  servingCommit: string | null;
  headingLevel?: 1 | 2;
}>) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  const Sub = headingLevel === 1 ? "h2" : "h3";
  return (
    <article aria-labelledby={`screen-${screen.id}`} className="help-screen">
      <header className="help-guide-header">
        <p className="help-kicker">Screen reference</p>
        <Title id={`screen-${screen.id}`}>{screen.title}</Title>
        <HelpMeta
          adminOnly={screen.adminOnly}
          audience={screen.who}
          lastUpdated={screen.lastUpdated}
          servingCommit={servingCommit}
        />
      </header>
      <p className="help-purpose">{screen.summary}</p>
      <p className="help-routes">
        Routes:{" "}
        {screen.routes.map((route, index) => (
          <span key={route}>
            {index ? ", " : ""}
            <code className="help-route">{route}</code>
          </span>
        ))}
      </p>
      {(screen.scenes ?? []).map((sceneId) => (
        <SceneFigure key={sceneId} sceneId={sceneId} />
      ))}
      <section aria-label={`Controls: ${screen.title}`}>
        <Sub>Controls</Sub>
        <div className="table-scroll">
          <table className="help-controls">
            <thead>
              <tr>
                <th scope="col">Control</th>
                <th scope="col">Kind</th>
                <th scope="col">What it reads, saves or does not do</th>
                <th scope="col">Who</th>
              </tr>
            </thead>
            <tbody>
              {screen.controls.map((control) => (
                <tr
                  id={helpControlAnchor(control.label)}
                  key={`${control.region}|${control.label}`}
                >
                  <td>
                    <strong>{control.label}</strong>
                    {control.region ? (
                      <span className="help-control-region">
                        {" "}
                        in {regionText(control.region)}
                      </span>
                    ) : null}
                  </td>
                  <td>{helpRoleText(control.role)}</td>
                  <td>{control.does}</td>
                  <td>{control.who}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {screen.guides.length ? (
        <section aria-label={`Guides that use ${screen.title}`} className="help-related">
          <Sub>Guides that use this screen</Sub>
          <ul>
            {screen.guides.map((id) => {
              const guide = helpGuideById(id);
              return guide ? (
                <li key={id}>
                  <Link href={helpGuideHref(guide.section, guide.id)} prefetch={false}>
                    {guide.title}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function regionText(region: string) {
  const [, ...name] = region.split(":");
  return name.length ? name.join(":") : region;
}

export function HelpMovedLine() {
  return (
    <p className="help-moved" role="status">
      This guide moved. Choose the current guide from this page or from Help contents.
    </p>
  );
}

export function HelpSectionPage({
  section,
  moved,
}: Readonly<{ section: HelpSection; moved: boolean }>) {
  const guides = guidesInSection(section.id);
  return (
    <>
      {moved ? <HelpMovedLine /> : null}
      <header className="help-guide-header">
        <p className="help-kicker">Help {HELP_VERSION}</p>
        <h1>{section.title}</h1>
      </header>
      <p className="help-purpose">{section.summary}</p>
      <ul className="help-card-list">
        {guides.map((guide) => (
          <li key={guide.id}>
            <Link href={helpGuideHref(section.id, guide.id)} prefetch={false}>
              {guide.title}
            </Link>
            {guide.adminOnly ? <span className="help-admin-label">Admin</span> : null}
            <p className="muted">{guide.purpose}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HelpLanding({
  servingCommit,
  moved,
}: Readonly<{ servingCommit: string | null; moved: boolean }>) {
  return (
    <>
      <HelpPrintFooter title="Staff help" />
      {moved ? <HelpMovedLine /> : null}
      <header className="help-guide-header">
        <p className="help-kicker">Help {HELP_VERSION}</p>
        <h1>{HELP_PRODUCT_TITLE}</h1>
        <p className="help-meta">
          <span>Help version {HELP_VERSION}</span>
          <span>
            Describes app release{" "}
            {servingCommit ? <code>{servingCommit}</code> : "not reported by this server"}
          </span>
        </p>
      </header>
      <p className="help-purpose">
        The app is where the PMI KC team works lease renewals, prepares and sends owner
        and tenant messages, gets documents ready for Dotloop, checks service connections,
        runs internal processes and manages people and access. This manual explains every
        part of it, one process at a time.
      </p>
      <section aria-label="How this manual is organized">
        <h2>How this manual is organized</h2>
        <p>
          Help contents lists each area of the app. Open an area to see its guides; each
          guide is a numbered process with the exact control to use, what you see
          afterwards and a picture of the screen. Reference lists every screen and its
          controls, and Glossary explains the terms the app uses. Admin guides carry an
          Admin label; every role can read them.
        </p>
      </section>
      <div className="help-page-actions help-print-hide">
        <Link className="secondary-button" href={HELP_PRINT_HREF} prefetch={false}>
          Print the whole manual
        </Link>
        <Link className="secondary-button" href={HELP_WHAT_CHANGED_HREF} prefetch={false}>
          What changed
        </Link>
      </div>
      <section aria-label="Areas of the app">
        <h2>Areas of the app</h2>
        <ul className="help-card-list">
          {HELP_SECTIONS.map((section) => (
            <li key={section.id}>
              <Link href={helpSectionHref(section.id)} prefetch={false}>
                {section.title}
              </Link>
              <p className="muted">{section.summary}</p>
            </li>
          ))}
          <li>
            <Link href={HELP_REFERENCE_HREF} prefetch={false}>
              Reference
            </Link>
            <p className="muted">Every screen, its controls and who can use them.</p>
          </li>
          <li>
            <Link href={HELP_GLOSSARY_HREF} prefetch={false}>
              Glossary
            </Link>
            <p className="muted">The terms the app uses, in plain words.</p>
          </li>
        </ul>
      </section>
    </>
  );
}

export function HelpReferenceIndex({ moved }: Readonly<{ moved: boolean }>) {
  return (
    <>
      <HelpPrintFooter title="Screens and controls" />
      {moved ? <HelpMovedLine /> : null}
      <header className="help-guide-header">
        <p className="help-kicker">Help {HELP_VERSION}</p>
        <h1>Screens and controls</h1>
      </header>
      <p className="help-purpose">
        One reference page per screen: every control by its label, what it reads, saves or
        does not do, and who can use it.
      </p>
      <ul className="help-card-list">
        {HELP_SCREEN_REFERENCES.map((screen) => (
          <li key={screen.id}>
            <Link href={helpScreenHref(screen.id)} prefetch={false}>
              {screen.title}
            </Link>
            {screen.adminOnly ? <span className="help-admin-label">Admin</span> : null}
            <p className="muted">{screen.summary}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export function HelpGlossaryBody({
  headingLevel = 1,
}: Readonly<{ headingLevel?: 1 | 2 }>) {
  const Title = headingLevel === 1 ? "h1" : "h2";
  return (
    <article aria-labelledby="help-glossary" className="help-glossary">
      <header className="help-guide-header">
        <p className="help-kicker">Help {HELP_VERSION}</p>
        <Title id="help-glossary">Glossary</Title>
      </header>
      <dl className="help-glossary-list">
        {HELP_GLOSSARY.map((term) => (
          <div id={term.id} key={term.id}>
            <dt>{term.term}</dt>
            <dd>{term.definition}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function HelpWhatChanged({
  servingCommit,
}: Readonly<{ servingCommit: string | null }>) {
  return (
    <>
      <HelpPrintFooter title="What changed" />
      <header className="help-guide-header">
        <p className="help-kicker">Help {HELP_VERSION}</p>
        <h1>What changed</h1>
      </header>
      <ol className="help-changelog">
        {HELP_CHANGELOG.map((entry, index) => (
          <li id={entry.version.toLowerCase().replace(".", "-")} key={entry.version}>
            <h2>
              {entry.version} · {formatCalendarDate(entry.date)}
            </h2>
            <p>{entry.summary}</p>
            {index === 0 ? (
              <p className="help-meta">
                Serving commit:{" "}
                {servingCommit ? (
                  <code>{servingCommit}</code>
                ) : (
                  "not reported by this server"
                )}
              </p>
            ) : null}
            {entry.affectedGuides.length ? (
              <p>
                Guides:{" "}
                {entry.affectedGuides
                  .map((id) => helpGuideById(id)?.title)
                  .filter(Boolean)
                  .join(", ")}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </>
  );
}

/** S242 R-S242-6: every guide, reference page and glossary entry as one printable document. */
export function HelpWholeManual({
  servingCommit,
}: Readonly<{ servingCommit: string | null }>) {
  return (
    <div className="help-print-manual">
      <HelpPrintFooter title="Whole manual" />
      <div className="help-page-actions help-print-hide">
        <HelpPrintButton label="Print the whole manual" />
      </div>
      <header className="help-guide-header help-print-cover">
        <h1>{HELP_PRODUCT_TITLE}</h1>
        <p className="help-meta">
          <span>Help version {HELP_VERSION}</span>
          <span>
            Describes app release{" "}
            {servingCommit ? <code>{servingCommit}</code> : "not reported by this server"}
          </span>
        </p>
        <ol className="help-print-contents">
          {HELP_SECTIONS.map((section) => (
            <li key={section.id}>
              {section.title}
              <ol>
                {guidesInSection(section.id).map((guide) => (
                  <li key={guide.id}>{guide.title}</li>
                ))}
              </ol>
            </li>
          ))}
          <li>Reference</li>
          <li>Glossary</li>
        </ol>
      </header>
      {HELP_SECTIONS.map((section) => (
        <section
          aria-label={section.title}
          className="help-print-section"
          key={section.id}
        >
          <h1 className="help-print-section-title">{section.title}</h1>
          {guidesInSection(section.id).map((guide) => (
            <HelpGuideBody
              guide={guide}
              headingLevel={2}
              key={guide.id}
              servingCommit={servingCommit}
            />
          ))}
        </section>
      ))}
      <section aria-label="Reference" className="help-print-section">
        <h1 className="help-print-section-title">Reference</h1>
        {HELP_SCREEN_REFERENCES.map((screen) => (
          <HelpScreenBody
            headingLevel={2}
            key={screen.id}
            screen={screen}
            servingCommit={servingCommit}
          />
        ))}
      </section>
      <section aria-label="Glossary" className="help-print-section">
        <HelpGlossaryBody headingLevel={2} />
      </section>
    </div>
  );
}

export function helpGuideCount() {
  return HELP_GUIDES.length;
}

export function HelpPageTitle({ children }: Readonly<{ children: ReactNode }>) {
  return <h1>{children}</h1>;
}
