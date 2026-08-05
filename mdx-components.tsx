import type { MDXComponents } from "mdx/types";
import { Callout } from "@/components/mdx/callout";
import { Step, Steps } from "@/components/mdx/steps";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children, ...props }) => (
      <h1
        className="mt-0 mb-4 text-[22px] font-bold tracking-[-0.01em] text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </h1>
    ),
    h2: ({ children, ...props }) => (
      <h2
        className="mt-8 mb-3 border-t border-[var(--bi-border)] pt-6 text-[16px] font-semibold tracking-[-0.005em] text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </h2>
    ),
    h3: ({ children, ...props }) => (
      <h3
        className="mt-5 mb-2 text-[14px] font-semibold text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </h3>
    ),
    p: ({ children, ...props }) => (
      <p className="my-3 text-[13px] leading-[1.7] text-[var(--bi-fg)]" {...props}>
        {children}
      </p>
    ),
    ul: ({ children, ...props }) => (
      <ul
        className="my-3 ml-5 list-disc text-[13px] leading-[1.7] text-[var(--bi-fg)] [&>li]:my-1"
        {...props}
      >
        {children}
      </ul>
    ),
    ol: ({ children, ...props }) => (
      <ol
        className="my-3 ml-5 list-decimal text-[13px] leading-[1.7] text-[var(--bi-fg)] [&>li]:my-1"
        {...props}
      >
        {children}
      </ol>
    ),
    a: ({ children, ...props }) => (
      <a
        className="text-[var(--bi-accent)] underline underline-offset-2 hover:opacity-70"
        {...props}
      >
        {children}
      </a>
    ),
    strong: ({ children, ...props }) => (
      <strong className="font-semibold text-[var(--bi-fg)]" {...props}>
        {children}
      </strong>
    ),
    code: ({ children, ...props }) => (
      <code
        className="rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-accent-light)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </code>
    ),
    pre: ({ children, ...props }) => (
      <pre
        className="my-4 overflow-x-auto rounded-[3px] border border-[var(--bi-border)] bg-[var(--bi-accent-light)] p-3 font-mono text-[12px] leading-[1.6] text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children, ...props }) => (
      <blockquote
        className="my-4 border-l-2 border-[var(--bi-border-strong)] bg-[var(--bi-sidebar-bg)] px-4 py-2 text-[13px] text-[var(--bi-muted)]"
        {...props}
      >
        {children}
      </blockquote>
    ),
    hr: (props) => (
      <hr className="my-6 border-t border-[var(--bi-border)]" {...props} />
    ),
    table: ({ children, ...props }) => (
      <div className="my-4 overflow-x-auto">
        <table
          className="w-full border-collapse border border-[var(--bi-border)] text-[12px]"
          {...props}
        >
          {children}
        </table>
      </div>
    ),
    th: ({ children, ...props }) => (
      <th
        className="border border-[var(--bi-border)] bg-[var(--bi-table-header)] px-2 py-1.5 text-left font-semibold text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }) => (
      <td
        className="border border-[var(--bi-border)] px-2 py-1.5 text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </td>
    ),
    kbd: ({ children, ...props }) => (
      <kbd
        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-[3px] border border-[var(--bi-border-strong)] bg-[var(--bi-card-bg)] px-1.5 font-mono text-[11px] text-[var(--bi-fg)]"
        {...props}
      >
        {children}
      </kbd>
    ),
    Callout,
    Steps,
    Step,
    ...components,
  };
}
