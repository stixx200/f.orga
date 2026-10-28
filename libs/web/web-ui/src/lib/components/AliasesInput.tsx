import { TagsInput, type TagsInputProps } from '@mantine/core';
import { useTranslation } from '@forga/web-sdk';

/**
 * Other names an import matches a record by (catalog entries, vehicles, alarm keywords, session types). Imports add
 * the values the user mapped to the record; a wrong mapping is removed here. Only Enter adds an alias, because names
 * may contain commas.
 */
export function AliasesInput({ value, onChange, ...props }: Omit<TagsInputProps, 'value' | 'onChange'> & { value: string[]; onChange: (value: string[]) => void }) {
  const { t } = useTranslation('common');
  return (
    <TagsInput
      label={t('aliases.label')}
      description={t('aliases.hint')}
      placeholder={t('aliases.placeholder')}
      value={value}
      onChange={onChange}
      splitChars={[]}
      clearable
      {...props}
    />
  );
}
