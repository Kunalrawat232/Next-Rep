import type { ReactNode } from 'react';
import { PageHeader, Section } from '../../components';
import { DEMO_MEDIA, PHOTO_MEDIA } from '../../domain/exercises/demoMedia';

/** A link to someone else's page: opens in a new tab and does not tell them where it came from. */
function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent">
      {children}
    </a>
  );
}

/** Who made the things Next Rep shows or builds on, and the limits they put on them. */
export function AboutPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader back="/settings" title="About and credits" />

      <Section headingId="credits-exercises" title="Exercises">
        <p className="text-callout text-ink-muted">{DEMO_MEDIA.credit.note}</p>
        <p className="text-callout">
          Exercise demonstrations ©{' '}
          <External href={DEMO_MEDIA.credit.ownerUrl}>{DEMO_MEDIA.credit.owner}</External>. Exercise
          data from{' '}
          <External href={DEMO_MEDIA.credit.datasetUrl}>{DEMO_MEDIA.credit.dataset}</External> (MIT
          licence). {PHOTO_MEDIA.credit.note} See{' '}
          <External href={PHOTO_MEDIA.credit.datasetUrl}>{PHOTO_MEDIA.credit.dataset}</External>.
        </p>
      </Section>

      <Section headingId="credits-look" title="The look">
        <p className="text-callout">
          The liquid glass buttons use{' '}
          <External href="https://github.com/naughtyduk/liquidGL">liquid-gl</External> (MIT
          licence). The text is set in{' '}
          <External href="https://github.com/vercel/geist-font">Geist</External> (SIL Open Font
          License 1.1).
        </p>
      </Section>

      <Section headingId="credits-ai" title="The coach and voice">
        <p className="text-callout text-ink-muted">
          The AI coach and the check of phrases the app is not sure about use Google&apos;s Gemini,
          and the coach asks Groq when Gemini is busy. Their answers are advice, never a record of
          what you lifted.
        </p>
      </Section>
    </div>
  );
}
