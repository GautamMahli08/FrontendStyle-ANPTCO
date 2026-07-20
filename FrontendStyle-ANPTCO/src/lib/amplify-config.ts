import { Amplify } from 'aws-amplify';

export const COGNITO_CONFIG = {
  userPoolId:       'ap-south-1_3LxH9jWxU',
  userPoolClientId: '1807uqe3cu8f0eo7694oo3n474',
  region:           'ap-south-1',
} as const;

export const API_BASE = 'https://crs4wdn0fl.execute-api.ap-south-1.amazonaws.com';

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
