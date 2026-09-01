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

interface VerifyEmailProps {
  name: string;
  verifyUrl: string;
}

export function VerifyEmail({ name, verifyUrl }: VerifyEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm your email address to finish setting up Shortly</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>
              Shortly<span style={wordmarkDot}>.</span>
            </Text>
            <Text style={eyebrow}>Confirm your email</Text>
          </Section>

          <Section style={content}>
            <Heading style={heading}>
              One click and you&apos;re in<span style={wordmarkDot}>.</span>
            </Heading>

            <Text style={text}>
              Hi {name}, welcome to Shortly. Confirm this address to activate
              your account and start turning long links into short ones.
            </Text>

            <Text style={chip}>Link expires in 24 hours</Text>

            <Section>
              <Button href={verifyUrl} style={button}>
                Verify email address
              </Button>
            </Section>

            <Section style={fallbackBox}>
              <Text style={fallbackLabel}>Or paste this into your browser</Text>
              <Link href={verifyUrl} style={fallbackLink}>
                {verifyUrl}
              </Link>
            </Section>

            <Hr style={divider} />

            <Text style={muted}>
              If you didn&apos;t sign up for Shortly, you can ignore this email
              — no account will be activated without this link.
            </Text>

            <Text style={footer}>Shortly · Long links, cut down to size</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default VerifyEmail;
