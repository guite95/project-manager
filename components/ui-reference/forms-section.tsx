"use client";

import { useState } from "react";
import { Button } from "@/components/erp/button";
import { DetailSection } from "@/components/erp/detail-section";
import {
  CheckboxField,
  SelectField,
  TextField,
} from "@/components/erp/form-field";
import { FormActions, FormGrid } from "@/components/erp/form-layout";

const COUNTRY_OPTIONS = [
  { value: "KR", label: "대한민국" },
  { value: "US", label: "미국" },
  { value: "JP", label: "일본" },
  { value: "CN", label: "중국" },
  { value: "DE", label: "독일" },
  { value: "FR", label: "프랑스" },
  { value: "GB", label: "영국" },
  { value: "VN", label: "베트남" },
];

const INITIAL = {
  text: "",
  select: "A",
  country: "KR",
  checked: false,
};

export function FormsSection() {
  const [text, setText] = useState(INITIAL.text);
  const [select, setSelect] = useState(INITIAL.select);
  const [country, setCountry] = useState(INITIAL.country);
  const [checked, setChecked] = useState(INITIAL.checked);
  const [message, setMessage] = useState("");

  return (
    <DetailSection title="4. 입력과 폼">
      <div className="max-w-[576px] px-6 py-4">
        <FormGrid>
          <TextField label="텍스트 필드" onChange={setText} value={text} />
          <SelectField
            label="셀렉트 필드 (일반)"
            onChange={setSelect}
            options={[
              { value: "A", label: "옵션 A" },
              { value: "B", label: "옵션 B" },
            ]}
            value={select}
          />
        </FormGrid>
        <div className="mt-4">
          <SelectField
            label="셀렉트 필드 (검색형)"
            onChange={setCountry}
            options={COUNTRY_OPTIONS}
            searchable
            value={country}
          />
        </div>
        <div className="mt-4">
          <CheckboxField
            checked={checked}
            label="체크박스"
            onChange={setChecked}
          />
        </div>
        <FormActions>
          {message ? (
            <span className="mr-auto self-center text-[11px] text-[var(--bi-success)]">
              {message}
            </span>
          ) : null}
          <Button
            onClick={() => {
              setText(INITIAL.text);
              setSelect(INITIAL.select);
              setCountry(INITIAL.country);
              setChecked(INITIAL.checked);
              setMessage("초기값으로 되돌렸습니다.");
            }}
            variant="secondary"
          >
            취소
          </Button>
          <Button onClick={() => setMessage("로컬 상태에 저장했습니다.")}>
            저장
          </Button>
        </FormActions>
      </div>
    </DetailSection>
  );
}
