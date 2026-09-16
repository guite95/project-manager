/** 알려진 비밀값 패턴만 마스킹한다. 임의의 민감 문장을 판별하는 기능은 아니다. */
export function redact(value) {
  return String(value ?? "")
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
      "[REDACTED_PRIVATE_KEY]",
    )
    .replace(
      /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|AKIA[A-Z0-9]{16})\b/g,
      "[REDACTED_SECRET]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED_SECRET]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[REDACTED_TOKEN]",
    )
    .replace(
      /((?:postgres(?:ql)?|mysql|redis|https?):\/\/[^\s/:]+:)[^\s@/]+@/gi,
      "$1[REDACTED_SECRET]@",
    )
    .replace(
      /(["']?(?:[A-Z0-9_]*(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token)|pw|비밀번호)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;]+)(?!\w)/gi,
      "$1[REDACTED_SECRET]",
    )
    .replace(
      /([?&](?:token|key|secret|password|signature)=)[^&#\s]+/gi,
      "$1[REDACTED_SECRET]",
    );
}
