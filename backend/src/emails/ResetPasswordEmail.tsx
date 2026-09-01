import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import {
  body,
  button,
  chip,
  container,
  content,
  divider,
  eyebrow,
  fallbackBox,
  fallbackLabel,
  fallbackLink,
  footer,
  header,
  heading,
  muted,
  text,
  wordmark,
  wordmarkDot,
} from "./styles.js";

interface ResetPasswordEmailProps {
  name: string;
  resetUrl: string;
}

export function ResetPasswordEmail({
  name,
  resetUrl,
}: ResetPasswordEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Shortly password</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>
              Shortly<span style={wordmarkDot}>.</span>
            </Text>
            <Text style={eyebrow}>Password reset</Text>
          </Section>

          <Section style={content}>
            <Heading style={heading}>
              Choose a new password<span style={wordmarkDot}>.</span>
            </Heading>

            <Text style={text}>
              Hi {name}, we got a request to reset the password on your Shortly
              account. Pick a new one and you&apos;ll be signed back in.
            </Text>

            <Text style={chip}>Expires in 1 hour · single use</Text>

            <Section>
              <Button href={resetUrl} style={button}>
                Reset password
              </Button>
            </Section>

            <Section style={fallbackBox}>
              <Text style={fallbackLabel}>Or paste this into your browser</Text>
              <Link href={resetUrl} style={fallbackLink}>
                {resetUrl}
              </Link>
            </Section>

            <Hr style={divider} />

            <Text style={muted}>
              If you didn&apos;t ask for this, you can ignore this email — your
              password stays exactly as it is. Resetting it signs you out
              everywhere, so anyone still logged in will need to sign in again.
            </Text>

            <Text style={footer}>Shortly · Long links, cut down to size</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ResetPasswordEmail;
