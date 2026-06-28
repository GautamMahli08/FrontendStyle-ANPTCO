import { Amplify } from 'aws-amplify';

export const COGNITO_CONFIG = {
  userPoolId:       'ap-south-1_dX40foitz',
  userPoolClientId: '5bqpa0mugutm3f9n7or6ckmglf',
  region:           'ap-south-1',
} as const;

export const API_BASE = 'https://jlkkd3rvih.execute-api.ap-south-1.amazonaws.com';

export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId:       COGNITO_CONFIG.userPoolId,
        userPoolClientId: COGNITO_CONFIG.userPoolClientId,
      },
    },
  });
}
