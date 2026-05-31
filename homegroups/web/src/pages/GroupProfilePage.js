import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useInView } from "react-intersection-observer";
import { httpsCallable } from "firebase/functions";
import { functions } from "../lib/firebase";
import GroupPageHead from "../components/GroupPageHead";
import GroupCallToAction from "../components/GroupCallToAction";
import NewsletterSignup from "../components/NewsletterSignup";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const PageContainer = styled.div`
  padding-top: 70px;
`;

const HeroSection = styled.section`
  background: linear-gradient(
    135deg,
    var(--primary-light) 0%,
    var(--primary-color) 100%
  );
  padding: 6rem 1rem 4rem;
  color: white;
  text-align: center;
`;

const HeroContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: ${(props) =>
    props.verified ? "rgba(76, 175, 80, 0.2)" : "rgba(255, 255, 255, 0.2)"};
  color: white;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 1rem;
`;

const PageTitle = styled.h1`
  font-size: 3rem;
  margin: 0 0 0.75rem;

  @media (max-width: 768px) {
    font-size: 2.25rem;
  }
`;

const PageSubtitle = styled.p`
  font-size: 1.125rem;
  opacity: 0.9;
  margin: 0;
`;

const ContentSection = styled.section`
  padding: 4rem 1rem;
  background-color: var(--background);
`;

const ContentContainer = styled.div`
  max-width: 960px;
  margin: 0 auto;
`;

const ErrorMessage = styled.div`
  color: var(--error-color);
  text-align: center;
  padding: 2rem;
  background: var(--background-alt);
  border-radius: 8px;
  margin: 2rem 0;
`;

const MeetingList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
`;

const MeetingItem = styled.li`
  background: var(--background-alt);
  padding: 1rem 1.25rem;
  border-radius: 8px;
  margin-bottom: 0.75rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

// Accepts either a numeric string ("0"-"6") or a day name ("sunday", "Monday").
function dayLabel(raw) {
  if (!raw) return "";
  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && asNum >= 0 && asNum <= 6)
    return DAY_NAMES[asNum];
  const lower = String(raw).toLowerCase();
  const idx = DAY_NAMES.findIndex((d) => d.toLowerCase() === lower);
  return idx >= 0 ? DAY_NAMES[idx] : "";
}

function formatMeeting(m) {
  const day = dayLabel(m.day);
  const time = m.time || "";
  return [day, time].filter(Boolean).join(" at ");
}

const GroupProfile = () => {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable(functions, "getPublicGroupProfile");
        const result = await fn({ groupId: id });
        if (cancelled) return;
        setGroup(result.data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (err && err.code === "functions/not-found") {
          setError("Group not found");
        } else {
          setError("Unable to load group information. Please try again later.");
        }
        setGroup(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <PageContainer>
        <ContentSection>
          <ContentContainer>
            <h2>Loading…</h2>
          </ContentContainer>
        </ContentSection>
      </PageContainer>
    );
  }

  if (error || !group) {
    const isNotFound = error === "Group not found" || !group;
    return (
      <PageContainer>
        <ContentSection>
          <ContentContainer>
            <ErrorMessage>
              <h2>{isNotFound ? "Group Not Found" : "Could not load group"}</h2>
              <p>
                {isNotFound ? "The requested group could not be found." : error}
              </p>
            </ErrorMessage>
          </ContentContainer>
        </ContentSection>
      </PageContainer>
    );
  }

  const locale = [group.city, group.state].filter(Boolean).join(", ");

  return (
    <PageContainer>
      <GroupPageHead group={group} />

      <HeroSection>
        <HeroContent>
          <Badge verified={group.isClaimed}>
            {group.isClaimed ? "Verified ✓" : "Unverified"}
          </Badge>
          <PageTitle>{group.name}</PageTitle>
          <PageSubtitle>
            {[group.type, locale].filter(Boolean).join(" · ")}
          </PageSubtitle>
        </HeroContent>
      </HeroSection>

      <ContentSection>
        <ContentContainer
          ref={ref}
          as={motion.div}
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 0.6 }}
        >
          {group.isClaimed && group.description && (
            <>
              <h2>About this group</h2>
              <p>{group.description}</p>
            </>
          )}

          <h2>Meetings</h2>
          {group.meetings && group.meetings.length > 0 ? (
            <MeetingList>
              {group.meetings.map((m, i) => (
                <MeetingItem key={i}>
                  <strong>{formatMeeting(m)}</strong>
                  <span>
                    {m.format}
                    {m.isOnline
                      ? " · Online"
                      : m.locationName
                        ? ` · ${m.locationName}`
                        : ""}
                  </span>
                </MeetingItem>
              ))}
            </MeetingList>
          ) : (
            <p>No meeting schedule is available for this group yet.</p>
          )}

          <GroupCallToAction group={group} />
        </ContentContainer>
      </ContentSection>

      <NewsletterSignup />
    </PageContainer>
  );
};

export default GroupProfile;
