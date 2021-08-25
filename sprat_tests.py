import unittest

from sprat import *

class TestSpratDeck(unittest.TestCase):
    def test_sprat_deck(self):
        player = "traviscj"
        c0 = Card(player, SUITS[0], FACES[0])
        c1 = Card(player, SUITS[0], FACES[1])
        cards = [c0, c1]
        sprat_deck = SpratDeck(cards)

        first = sprat_deck.get()
        self.assertTrue(first == c0)

        second = sprat_deck.get()
        self.assertTrue(second == c1)


class TestPile(unittest.TestCase):
    def test_pile(self):
        player = "traviscj"
        king_hearts = Card(player, SUITS[0], FACES[12])
        queen_hearts = Card(player, SUITS[0], FACES[11])
        queen_spades = Card(player, SUITS[2], FACES[11])
        jack_hearts = Card(player, SUITS[0], FACES[10])
        jack_spades = Card(player, SUITS[2], FACES[10])
        p = Pile(king_hearts)
        self.assertFalse(p.can_place(queen_hearts))
        self.assertTrue(p.can_place(queen_spades))
        p.place(queen_spades)

        self.assertTrue(p.can_place(jack_hearts))
        self.assertFalse(p.can_place(jack_spades))

    def test_pile_to_pile(self):
        player = "traviscj"
        king_hearts = Card(player, CardSuit.HEARTS, CardFace.KING)
        queen_hearts = Card(player, CardSuit.HEARTS, CardFace.QUEEN)
        queen_spades = Card(player, CardSuit.SPADES, CardFace.QUEEN)
        jack_hearts = Card(player, CardSuit.HEARTS, CardFace.JACK)
        jack_spades = Card(player, CardSuit.SPADES, CardFace.JACK)
        ten_spades = Card(player, CardSuit.SPADES, CardFace.TEN)
        p1 = Pile(king_hearts)
        p1.place(queen_spades)
        p2 = Pile(jack_hearts)
        p2.place(ten_spades)

        print(p1)
        print(p2)

    def test_suits(self):
        print(CardSuit.HEARTS.icon())
        print(CardFace.ACE.asset_face())
        print(CardFace.THREE.asset_face())
        print(CardFace.TEN.asset_face())
        print(CardFace.JACK.asset_face())
        print(CardFace.QUEEN.asset_face())
        print(CardFace.KING.asset_face())

    def test_stack_from_pile_to_pile(self):
        player = "traviscj"

        king_hearts = Card(player, SUITS[0], FACES[12])
        queen_hearts = Card(player, SUITS[0], FACES[11])
        queen_spades = Card(player, SUITS[2], FACES[11])
        jack_hearts = Card(player, SUITS[0], FACES[10])
        jack_spades = Card(player, SUITS[2], FACES[10])
        ten_spades = Card(player, SUITS[2], FACES[9])
        p1 = Pile(king_hearts)
        p1.place(queen_spades)
        p2 = Pile(jack_hearts)
        p2.place(ten_spades)

        # print("test_stack_from_pile_to_pile p1", p1)
        # print("test_stack_from_pile_to_pile p2", p2)
        # print("CardSuit.HEARTS.icon() = ", CardSuit.HEARTS.icon())


class TestFlipDeck(unittest.TestCase):
    def test_flip_deck(self):
        player = "traviscj"
        king_hearts = Card(player, SUITS[0], FACES[12])
        queen_hearts = Card(player, SUITS[0], FACES[11])
        queen_spades = Card(player, SUITS[2], FACES[11])
        jack_hearts = Card(player, SUITS[0], FACES[10])
        jack_spades = Card(player, SUITS[2], FACES[10])
        cards = [
            king_hearts,
            queen_hearts,
            queen_spades,
            jack_hearts,
            jack_spades
        ]
        flip_deck = FlipDeck(cards)

        flip_deck.flip()
        self.assertEqual(flip_deck.peek(), queen_spades)

        flip_deck.flip()

        self.assertEqual(flip_deck.peek(), jack_spades)

        flip_deck.flip()

        self.assertEqual(flip_deck.peek(), queen_spades)

        qs2 = flip_deck.get()

        self.assertEqual(queen_spades, qs2)




class TestAcePile(unittest.TestCase):
    def test_ace_pile(self):
        a = AcePile()
    
        player = "traviscj"
        ace_hearts = Card(player, SUITS[0], FACES[0])
        two_hearts = Card(player, SUITS[0], FACES[1])
        two_spades = Card(player, SUITS[2], FACES[1])

        self.assertTrue(True)
        self.assertFalse(False)
        
        self.assertTrue(a.can_place(ace_hearts))
        
        a.place(ace_hearts)
        
        self.assertFalse(a.can_place(ace_hearts))
        self.assertTrue(a.can_place(two_hearts))
        self.assertFalse(a.can_place(two_spades))
        a.place(two_hearts)

if __name__ == '__main__':
    unittest.main()
