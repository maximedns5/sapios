-- Nouveau design de l'app (lot 1) : textes de verdict revus d'après l'audit UX (n° 12 à 14) et textes
-- de l'attente du verdict (n° 10). La blague vise la grille, jamais la personne ; la suite est factuelle.
-- On ne remplace un texte que s'il vaut encore sa valeur d'origine : une modification faite depuis le
-- back-office (« Textes ») est toujours conservée.

update public.app_copy as c
set text = v.new_text
from (
  values
    ('verdict.waitlist', 'Liste d''attente. On vous rappellera. Peut-être.', 'Vous y êtes presque.'),
    ('verdict.refused', 'Diplôme non validé = pas assez intelligent.', 'Pas cette fois.'),
    ('verdict.uninstall', 'Désinstallez.', 'Pas cette fois.'),
    ('verdict.rejected', 'Document refusé. Nous l''avons lu deux fois. Par politesse.', 'Document non retenu.'),
    ('verdict.needs_more', 'Illisible. Même pour nous. Renvoyez une version nette, en entier, à votre nom.', 'Il manque une pièce.'),
    ('feed.empty', 'Plus personne à votre hauteur dans les parages. Revenez demain, ou lisez un livre.', 'Tous les profils qui vous correspondent sont passés. Revenez demain, ou lisez un livre.')
) as v (key, old_text, new_text)
where c.key = v.key
  and c.locale = 'fr'
  and c.text = v.old_text;

-- Délai annoncé et suite de l'attente : réglables sans redéployer (par exemple quand les emails de
-- verdict seront configurés). `do nothing` : un texte déjà présent n'est jamais remplacé.
insert into public.app_copy (key, locale, text)
values
  ('review.delay', 'fr', 'Réponse sous 48 h, souvent plus tôt.'),
  ('review.notice', 'fr', 'Inutile de rester sur cette page : le verdict s''affichera ici à votre prochaine visite.')
on conflict (key, locale) do nothing;
