import {
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  createTheme,
  Input,
  type MantineColorsTuple,
  Modal,
  MultiSelect,
  NavLink,
  Paper,
  Select,
  Tabs,
  Tooltip,
} from '@mantine/core';
import { parseDateInput } from '@forga/web-sdk';
import { wordsFilter } from './search';

/** Colors from the style guide (Stil.md) and the approved mockups. */
export const colors = {
  service: '#8C1D18',
  serviceDark: '#6F1612',
  text: '#222222',
  secondaryText: '#444444',
  meta: '#595959',
  surface: '#FFFFFF',
  alternateRow: '#FBF7F6',
  grid: '#E0D2D0',
  pageBackground: '#F7F4F3',
  warning: '#F8ECEB',
  done: '#EEF6F0',
  doneText: '#2E6B3F',
  primaryReport: '#F3E4E2',
  fieldBorder: '#9B8A88',
  notice: '#FFF6E0',
  noticeText: '#6B4B00',
} as const;

const brand: MantineColorsTuple = [
  '#fbf1f0', '#f3e4e2', '#e6c2be', '#d99d97', '#ce7d75',
  '#c6675e', '#b04a40', '#8c1d18', '#7a1914', '#661410',
];

/** Material elevation levels used by the mockups. */
export const elevation = {
  1: '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24)',
  2: '0 3px 1px -2px rgba(0, 0, 0, 0.2), 0 2px 2px 0 rgba(0, 0, 0, 0.14), 0 1px 5px 0 rgba(0, 0, 0, 0.12)',
  4: '0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 4px 5px 0 rgba(0, 0, 0, 0.14), 0 1px 10px 0 rgba(0, 0, 0, 0.12)',
  8: '0 5px 5px -3px rgba(0, 0, 0, 0.2), 0 8px 10px 1px rgba(0, 0, 0, 0.14), 0 3px 14px 2px rgba(0, 0, 0, 0.12)',
  24: '0 11px 15px -7px rgba(0, 0, 0, 0.2), 0 24px 38px 3px rgba(0, 0, 0, 0.14), 0 9px 46px 8px rgba(0, 0, 0, 0.12)',
} as const;

/**
 * Mantine theme of f.orga: service red as primary color, Arial, angular Material-like shapes
 * (4 px corners, flat elevation), upper-case buttons and tabs with an underline.
 */
export const forgaTheme = createTheme({
  primaryColor: 'brand',
  primaryShade: 7,
  colors: { brand },
  fontFamily: 'Arial, Helvetica, sans-serif',
  headings: { fontFamily: 'Arial, Helvetica, sans-serif', fontWeight: '700' },
  black: colors.text,
  defaultRadius: 'xs',
  radius: { xs: '4px', sm: '4px', md: '4px', lg: '4px', xl: '4px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  shadows: { xs: elevation[1], sm: elevation[1], md: elevation[4], lg: elevation[8], xl: elevation[24] },
  focusRing: 'auto',
  components: {
    Button: Button.extend({
      defaultProps: { radius: 'xs' },
      styles: (_theme, props) => ({
        root: {
          height: 36,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 700,
          boxShadow: props.variant === 'filled' || !props.variant ? elevation[2] : undefined,
        },
      }),
    }),
    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'gray' } }),
    Badge: Badge.extend({
      defaultProps: { radius: 'xs', variant: 'light' },
      styles: { root: { textTransform: 'none', fontWeight: 700, letterSpacing: 0 } },
    }),
    Input: Input.extend({
      styles: {
        input: { borderColor: colors.fieldBorder },
      },
    }),
    Tabs: Tabs.extend({
      defaultProps: { variant: 'default' },
      styles: {
        tab: { textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, borderBottomWidth: 2 },
      },
    }),
    Paper: Paper.extend({ defaultProps: { radius: 'xs', shadow: 'xs', p: 'lg' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'xs', shadow: 'xl', overlayProps: { backgroundOpacity: 0.5, blur: 0 } } }),
    NavLink: NavLink.extend({ styles: { root: { borderRadius: 0 } } }),
    Tooltip: Tooltip.extend({ defaultProps: { withArrow: true } }),
    // Search words in any order, so "Felix Funke" finds "Funke, Felix".
    Select: Select.extend({ defaultProps: { filter: wordsFilter } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { filter: wordsFilter } }),
    Autocomplete: Autocomplete.extend({ defaultProps: { filter: wordsFilter } }),
    // Typed dates as shown (`DD.MM.YYYY`): the default parser of Mantine reads `01.03.2025` as 3 January.
    DateInput: { defaultProps: { dateParser: parseDateInput } },
  },
});
