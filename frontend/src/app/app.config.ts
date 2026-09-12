import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';
import { routes } from './app.routes';

const AvisiPreset = definePreset(Aura, {
  primitive: {
    fontFamily: "'Poppins', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },
  semantic: {
    primary: {
      50: '#e8f4f8',
      100: '#c5e3ee',
      200: '#9fd0e2',
      300: '#74bdd6',
      400: '#4aaeca',
      500: '#1199bb',
      600: '#0e87a7',
      700: '#0b7592',
      800: '#08627c',
      900: '#003345',
      950: '#002030',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.500}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.600}',
          activeColor: '{primary.700}',
        },
        highlight: {
          background: 'rgba(17,153,187,0.1)',
          focusBackground: 'rgba(17,153,187,0.2)',
          color: '{primary.500}',
          focusColor: '{primary.600}',
        },
        // Derived from the app's own blue-biased tokens, so a control sits in
        // the same family of grey as the card it is drawn on.
        surface: {
          0: '#ffffff',
          50: '#f5f7fa',
          100: '#f0f3f6',
          200: '#dde5ea',
          300: '#c3d1d9',
          400: '#a2b6c1',
          500: '#87a0ac',
          600: '#63808f',
          700: '#4d6975',
          800: '#33505c',
          900: '#1a3440',
          950: '#0d222b',
        },
      },
      dark: {
        primary: {
          color: '{primary.400}',
          contrastColor: '#ffffff',
          hoverColor: '{primary.300}',
          activeColor: '{primary.200}',
        },
        highlight: {
          background: 'rgba(17,153,187,0.2)',
          focusBackground: 'rgba(17,153,187,0.3)',
          color: '{primary.300}',
          focusColor: '{primary.200}',
        },
        surface: {
          0: '#ffffff',
          50: '#f0f4f7',
          100: '#dce6ec',
          200: '#b8cdd8',
          300: '#91b0c0',
          400: '#6b96ab',
          500: '#4d7d94',
          600: '#35667c',
          700: '#1e4f62',
          800: '#003345',
          900: '#002233',
          950: '#001520',
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: MessageService, useClass: MessageService },
    providePrimeNG({
      theme: {
        preset: AvisiPreset,
        options: {
          darkModeSelector: '.app-dark',
          cssLayer: false,
        },
      },
    }),
  ],
};
