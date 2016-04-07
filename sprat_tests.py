import unittest

from sprat import *

class TestSpratDeck(unittest.TestCase):
    def test_sprat_deck(self):
        player = "traviscj"
        cards = [Card(player, SUITS[0], FACES[0]),Card(player, SUITS[0], FACES[1])]
        sprat_deck = SpratDeck(cards)
        
        print sprat_deck
        c1 = sprat_deck.get()
        print sprat_deck
        c2 = sprat_deck.get()
        print sprat_deck
        
class TestPile(unittest.TestCase):
    def test_pile(self):
        player = "traviscj"
        king_hearts = Card(player, SUITS[0], FACES[12])
        queen_hearts = Card(player, SUITS[0], FACES[11])
        queen_spades = Card(player, SUITS[2], FACES[11])
        jack_hearts = Card(player, SUITS[0], FACES[10])
        jack_spades = Card(player, SUITS[2], FACES[10])
        p = Pile(king_hearts)
        print king_hearts
        print queen_hearts
        print queen_spades

        print p.can_place(queen_hearts)
        print p.can_place(queen_spades)
        p.place(queen_spades)

        print p
        print p.can_place(jack_hearts)
        print p.can_place(jack_spades)
        

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
        print flip_deck
    
        flip_deck.flip()
    
        print flip_deck
    
        flip_deck.flip()
    
        print flip_deck
    
        flip_deck.flip()
    
        print flip_deck
    
        print "grab", flip_deck.get()
        print flip_deck

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
